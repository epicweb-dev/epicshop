import path from 'path'
import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { Link, useFetcher } from '@remix-run/react'
import { clsx } from 'clsx'
import fsExtra from 'fs-extra'
import { useEffect } from 'react'
import { z, type ZodTypeAny } from 'zod'
import { useApps } from '#app/components/apps'
import { showProgressBarField } from '#app/components/progress-bar.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { launchEditor } from '#app/utils/launch-editor.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { useRequestInfo } from '#app/utils/request-info'
import { createToastHeaders } from '#app/utils/toast.server.ts'

function getFileDescriptorSchema<AppFile extends ZodTypeAny>(appFile: AppFile) {
	return z.union([
		z.object({
			type: z.literal('file'),
			file: z.string(),
		}),
		z.object({
			type: z.literal('appFile'),
			appFile,
			appName: z.string(),
		}),
	])
}

const LaunchSchema = z.intersection(
	z.object({
		line: z.coerce.number().optional(),
		column: z.coerce.number().optional(),
		syncTo: getFileDescriptorSchema(z.string()).optional(),
	}),
	getFileDescriptorSchema(z.array(z.string())),
)

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const syncTo = {
		type: formData.get('syncTo.type') ?? undefined,
		file: formData.get('syncTo.file') ?? undefined,
		workshopFile: formData.get('syncTo.workshopFile') ?? undefined,
		appFile: formData.getAll('syncTo.appFile'),
		appName: formData.get('syncTo.appName') ?? undefined,
	}
	const syncToIsProvided = Object.values(syncTo).some((v) =>
		Array.isArray(v) ? v.length : v,
	)
	const rawData = {
		type: formData.get('type'),
		file: formData.get('file'),
		workshopFile: formData.get('workshopFile'),
		appFile: formData.getAll('appFile'),
		appName: formData.get('appName'),
		line: formData.get('line') ?? undefined,
		column: formData.get('column') ?? undefined,
		syncTo: syncToIsProvided
			? {
					type: formData.get('syncTo.type'),
					file: formData.get('syncTo.file'),
					workshopFile: formData.get('syncTo.workshopFile'),
					appFile: formData.getAll('syncTo.appFile'),
					appName: formData.get('syncTo.appName'),
				}
			: undefined,
	}
	const form = LaunchSchema.parse(rawData)

	async function getFiles(
		fileDescriptor:
			| ({ line?: number; colum?: number } & {
					type: 'file'
					file: string
					appName?: never
					appFile?: never
			  })
			| {
					type: 'appFile'
					file?: never
					appName: string
					appFile: string | Array<string>
			  },
	): Promise<Array<{ filepath: string; line?: number; column?: number }>> {
		if (fileDescriptor.type === 'file') {
			return [
				{
					filepath: fileDescriptor.file,
					line: fileDescriptor.line,
					column: fileDescriptor.colum,
				},
			]
		} else {
			const fileDescriptorApp = await getAppByName(fileDescriptor.appName)
			if (!fileDescriptorApp) {
				throw new Response(`App "${fileDescriptor.appName}" Not found`, {
					status: 404,
				})
			}
			const appFile = Array.isArray(fileDescriptor.appFile)
				? fileDescriptor.appFile
				: [fileDescriptor.appFile]
			return appFile.map((file) => {
				const [filePath, line = '1', column = '1'] = file.split(',')
				if (!filePath) {
					throw new Response(
						`appFile missing file path: ${fileDescriptor.appFile}`,
						{ status: 400 },
					)
				}
				return {
					filepath: path.join(fileDescriptorApp.fullPath, filePath),
					line: Number(line),
					column: Number(column),
				}
			})
		}
	}

	const filesToOpen = await getFiles(form)
	if ('syncTo' in form && form.syncTo) {
		const originFiles = await getFiles(form.syncTo)
		for (let index = 0; index < originFiles.length; index++) {
			const originFile = originFiles[index]
			if (!originFile) continue
			const destFile = filesToOpen[index]
			if (!destFile) {
				throw new Response(
					`Trying to sync to a file that does not appear at index ${index}`,
				)
			}
			await fsExtra.ensureDir(path.dirname(destFile.filepath))
			await fsExtra.promises.copyFile(originFile.filepath, destFile.filepath)
		}
	}
	const results: Array<
		{ status: 'success' } | { status: 'error'; message: string }
	> = []
	for (const file of filesToOpen) {
		results.push(await launchEditor(file.filepath, file.line, file.column))
	}

	if (results.every((r) => r.status === 'success')) {
		return json({ status: 'success' } as const)
	} else {
		const messages = results
			.map((r, index, array) =>
				r.status === 'error'
					? array.length > 1
						? `${index}. ${r.message}`
						: r.message
					: null,
			)
			.filter(Boolean)
			.join('\n')
		console.error('Launch editor error:', messages)
		return json({ status: 'error', message: messages } as const, {
			headers: await createToastHeaders({
				type: 'error',
				title: 'Launch Editor Error',
				description: messages,
			}),
		})
	}
}

type FileDescriptorProps<AppFile> =
	| {
			file: string
			appFile?: never
			appName?: never
	  }
	| {
			file?: never
			appFile: AppFile
			appName: string
	  }

type LaunchEditorProps = {
	line?: number
	column?: number
	syncTo?: FileDescriptorProps<string>
	children: React.ReactNode
	onUpdate?: (state: string) => void
} & FileDescriptorProps<string | string[]>

function useLaunchFetcher(onUpdate?: ((state: string) => void) | undefined) {
	const fetcher = useFetcher<typeof action>()

	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data != null) {
			onUpdate?.('fetcher-done')
		}
	}, [fetcher, onUpdate])

	return fetcher
}

function LaunchEditorImpl({
	file,
	appFile,
	appName,
	syncTo,
	line,
	column,
	children,
	onUpdate,
}: LaunchEditorProps) {
	const fetcher = useLaunchFetcher(onUpdate)

	const fileList = typeof appFile === 'string' ? [appFile] : appFile
	const type = file ? 'file' : appFile ? 'appFile' : ''
	const syncToType = syncTo?.file ? 'file' : syncTo?.appFile ? 'appFile' : ''

	return (
		<fetcher.Form
			action="/launch-editor"
			method="POST"
			className="flex items-center"
		>
			{showProgressBarField}
			<input type="hidden" name="line" value={line} />
			<input type="hidden" name="column" value={column} />
			<input type="hidden" name="type" value={type} />
			<input type="hidden" name="file" value={file} />
			<input type="hidden" name="appName" value={appName} />
			{fileList?.map((file) => (
				<input type="hidden" name="appFile" key={file} value={file} />
			))}
			{syncTo ? (
				<>
					<input type="hidden" name="syncTo.type" value={syncToType} />
					<input type="hidden" name="syncTo.file" value={syncTo.file} />
					<input type="hidden" name="syncTo.appName" value={syncTo.appName} />
					<input type="hidden" name="syncTo.appFile" value={syncTo.appFile} />
				</>
			) : null}
			<button
				type="submit"
				className={clsx(
					'launch_button',
					fetcher.state === 'idle' ? null : 'cursor-progress',
					fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
				)}
			>
				{children}
			</button>
		</fetcher.Form>
	)
}

function LaunchGitHub({
	file,
	appFile,
	appName,
	line,
	children,
}: LaunchEditorProps) {
	const apps = useApps()
	const requestInfo = useRequestInfo()
	if (Array.isArray(appFile)) {
		return <div>Cannot open more than one file</div>
	}
	if (file) {
		const safePath = (s: string) => s.replace(/\\/g, '/')
		return (
			<a
				className="launch_button !no-underline"
				href={
					safePath(file).replace(
						safePath(ENV.EPICSHOP_CONTEXT_CWD),
						ENV.EPICSHOP_GITHUB_ROOT,
					) + (line ? `#L${line}` : '')
				}
				rel="noreferrer"
				target="_blank"
			>
				{children}
			</a>
		)
	}
	const app = apps.find((a) => a.name === appName)
	const path = [
		...(app?.relativePath.split(requestInfo.separator) ?? []),
		appFile + (line ? `#L${line}` : ''),
	].join('/')
	return (
		<a
			className="launch_button !no-underline"
			href={`${ENV.EPICSHOP_GITHUB_ROOT}/${path}`}
			rel="noreferrer"
			target="_blank"
		>
			{children}
		</a>
	)
}

export function EditFileOnGitHub({
	appFile = 'README.mdx',
	appName,
	file,
	relativePath,
}: {
	appFile?: string
	relativePath: string
} & (
	| {
			file: string
			appName?: never
	  }
	| {
			file?: never
			appName: string
	  }
)) {
	const fetcher = useLaunchFetcher()

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		if (!e.altKey || ENV.EPICSHOP_DEPLOYED) return
		e.preventDefault()
		const formData = new FormData()
		const type = file ? 'file' : 'appFile'
		formData.append(type, file ?? appFile)
		formData.append('type', type)
		if (appName) {
			formData.append('appName', appName)
		}
		fetcher.submit(formData, { method: 'POST', action: '/launch-editor' })
	}

	const githubPath = ENV.EPICSHOP_GITHUB_ROOT.replace(
		/\/tree\/|\/blob\//,
		'/edit/',
	)

	return (
		<Link
			className="self-center font-mono text-sm"
			onClick={handleClick}
			target="_blank"
			to={`${githubPath}/${relativePath}/${appFile}`.replace(/\\/g, '/')}
		>
			<span className="block md:hidden">Edit on GitHub</span>
			<span className="hidden md:block">Edit this page on GitHub</span>
		</Link>
	)
}

export const LaunchEditor = ENV.EPICSHOP_DEPLOYED
	? ENV.EPICSHOP_GITHUB_ROOT
		? LaunchGitHub
		: ({ children }: LaunchEditorProps) => (
				<SimpleTooltip content="Cannot open files in deployed app">
					<button className="launch_button cursor-not-allowed">
						{children}
					</button>
				</SimpleTooltip>
			)
	: LaunchEditorImpl
