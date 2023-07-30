import { useEffect } from 'react'
import path from 'path'
import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useFetcher } from '@remix-run/react'
import { getAppByName } from '~/utils/apps.server.ts'
import { z } from 'zod'
import { type Result, launchEditor } from '~/utils/launch-editor.server.ts'
import { clsx } from 'clsx'
import { showToast } from '~/components/toast.tsx'
import { ensureUndeployed } from '~/utils/misc.tsx'

const launchSchema = z.intersection(
	z.object({
		line: z.coerce.number().optional(),
		column: z.coerce.number().optional(),
	}),
	z.union([
		z.object({
			type: z.literal('file'),
			file: z.string(),
		}),
		z.object({
			type: z.literal('appFile'),
			appFile: z.array(z.string()),
			appName: z.string(),
		}),
	]),
)

export async function action({ request }: DataFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const rawData = {
		type: formData.get('type'),
		file: formData.get('file'),
		workshopFile: formData.get('workshopFile'),
		appFile: formData.getAll('appFile'),
		appName: formData.get('appName'),
		line: formData.get('line') ?? undefined,
		column: formData.get('column') ?? undefined,
	}
	const form = launchSchema.parse(rawData)
	let result: Result = {
		status: 'error',
		error: 'unexpected error from launch-editor action',
	}
	switch (form.type) {
		case 'file': {
			result = await launchEditor(form.file, form.line, form.column)
			break
		}
		case 'appFile': {
			const app = await getAppByName(form.appName)
			if (!app) {
				throw new Response(`App "${form.appName}" Not found`, { status: 404 })
			}
			result = { status: 'success' }
			const promises = form.appFile.map(async file => {
				const [filePath = '', line = '1', column = '1'] = file.split(',')
				const fullPath = path.join(app.fullPath, filePath)
				const launchResult = await launchEditor(fullPath, +line, +column)
				if (launchResult.status === 'error') {
					console.log(
						`Launch editor error while opening: ${filePath}\n${launchResult.error}\n`,
					)
					if (result.status === 'success') {
						result = launchResult
					} else {
						result.error =
							'Could not open some files in the editor, see the terminal for more information.'
					}
				}
			})
			await Promise.all(promises)
			break
		}
	}

	return json(result)
}

type LaunchEditorProps = {
	line?: number
	column?: number
	children: React.ReactNode
	onUpdate?: (state: string) => void
} & (
	| {
			file: string
			appFile?: never
			appName?: never
	  }
	| {
			file?: never
			appFile: string | string[]
			appName: string
	  }
)

function useLaunchFetcher(onUpdate?: ((state: string) => void) | undefined) {
	const fetcher = useFetcher<typeof action>()

	useEffect(() => {
		switch (fetcher.state) {
			case 'loading': {
				const error = fetcher.data?.status === 'error' ? fetcher.data.error : ''
				if (error) {
					showToast(document, {
						title: 'Launch Editor Error',
						variant: 'Error',
						content: error,
					})
				}
			}
			case 'idle': {
				if (fetcher.data != null) onUpdate?.('fetcher-done')
			}
		}
	}, [fetcher, onUpdate])

	return fetcher
}

function LaunchEditorImpl({
	file,
	appFile,
	appName,
	line,
	column,
	children,
	onUpdate,
}: LaunchEditorProps) {
	const fetcher = useLaunchFetcher(onUpdate)

	const fileList = typeof appFile === 'string' ? [appFile] : appFile
	const type = file ? 'file' : appFile ? 'appFile' : ''
	return (
		<fetcher.Form action="/launch-editor" method="POST">
			<input type="hidden" name="line" value={line} />
			<input type="hidden" name="column" value={column} />
			<input type="hidden" name="type" value={type} />
			<input type="hidden" name="file" value={file} />
			<input type="hidden" name="appName" value={appName} />
			{fileList?.map(file => (
				<input type="hidden" name="appFile" key={file} value={file} />
			))}
			<button
				type="submit"
				className={clsx(
					'launch_button',
					fetcher.state !== 'idle' ? 'cursor-progress' : null,
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
	column,
	children,
	onUpdate,
}: LaunchEditorProps) {
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
						safePath(ENV.KCDSHOP_CONTEXT_CWD),
						ENV.KCDSHOP_GITHUB_ROOT,
					) + (line ? `#L${line}` : '')
				}
				rel="noreferrer"
				target="_blank"
			>
				{children}
			</a>
		)
	}
	const path = [
		...(appName?.split('__sep__') ?? []),
		appFile + (line ? `#L${line}` : ''),
	].join('/')
	return (
		<a
			className="launch_button no-underline!"
			href={ENV.KCDSHOP_GITHUB_ROOT + '/' + path}
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
		if (!e.altKey || ENV.KCDSHOP_DEPLOYED) return
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

	const githubPath = ENV.KCDSHOP_GITHUB_ROOT.replace(
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
			Edit this page on GitHub
		</Link>
	)
}

export const LaunchEditor = ENV.KCDSHOP_DEPLOYED
	? ENV.KCDSHOP_GITHUB_ROOT
		? LaunchGitHub
		: ({ children }: LaunchEditorProps) => (
				<button
					className="launch_button cursor-not-allowed"
					title="Cannot open files in deployed app"
				>
					{children}
				</button>
		  )
	: LaunchEditorImpl
