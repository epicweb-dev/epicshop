'use client'

import { useEffect } from 'react'
import { Link, useFetcher } from 'react-router'
import { showProgressBarField } from '#app/components/progress-bar.tsx'
import { cn } from '#app/utils/misc.tsx'
import { usePERedirectInput } from '#app/utils/pe.client.tsx'
import { useApps, useRequestInfo } from '#app/utils/root-loader.ts'

type LaunchEditorActionData =
	| { status: 'success' }
	| { status: 'error'; message: string }

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
	className?: string
	line?: number
	column?: number
	syncTo?: FileDescriptorProps<string>
	children: React.ReactNode
	onUpdate?: (state: string) => void
} & FileDescriptorProps<string | string[]>

function getGithubRoot() {
	const env = typeof window === 'undefined' ? ENV : window.ENV
	if (env?.EPICSHOP_GITHUB_ROOT) return env.EPICSHOP_GITHUB_ROOT
	if (env?.EPICSHOP_GITHUB_REPO) {
		return `${env.EPICSHOP_GITHUB_REPO.replace(/\/$/, '')}/tree/main`
	}
	return ''
}

function useLaunchFetcher(onUpdate?: ((state: string) => void) | undefined) {
	const fetcher = useFetcher<LaunchEditorActionData>()

	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data != null) {
			onUpdate?.('fetcher-done')
		}
	}, [fetcher, onUpdate])

	return fetcher
}

function LaunchEditorImpl({
	className,
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
	const peRedirectInput = usePERedirectInput()

	if (!file && !appFile) {
		console.error('LaunchEditor: requires either "file" or "appFile" prop.')
		return null
	}
	const fileList = typeof appFile === 'string' ? [appFile] : appFile
	const type = file ? 'file' : 'appFile'
	const syncToType = syncTo?.file ? 'file' : syncTo?.appFile ? 'appFile' : ''

	return (
		<fetcher.Form
			action="/launch-editor"
			method="POST"
			className="flex items-center"
		>
			{peRedirectInput}
			{showProgressBarField}
			<input
				type="hidden"
				name="line"
				value={typeof line === 'number' ? line : undefined}
			/>
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
				className={cn(
					'launch_button',
					fetcher.state === 'idle' ? null : 'cursor-progress',
					fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
					className,
				)}
			>
				{children}
			</button>
		</fetcher.Form>
	)
}

function LaunchGitHub({
	className,
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
		// Convert tree to blob for individual files
		const githubFileRoot = getGithubRoot().replace('/tree/', '/blob/')
		return (
			<a
				className="launch_button !no-underline"
				href={
					safePath(file).replace(
						safePath(ENV.EPICSHOP_CONTEXT_CWD),
						githubFileRoot,
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
	// Convert tree to blob for individual files
	const githubFileRoot = getGithubRoot().replace('/tree/', '/blob/')

	// Parse appFile to extract filename and line number (format: "filename,line,column")
	const [filename, appFileLine] = appFile ? appFile.split(',') : ['', '']
	const lineNumber = line || (appFileLine ? Number(appFileLine) : undefined)

	const path = [
		...(app?.relativePath.split(requestInfo.separator) ?? []),
		filename,
	].join('/')
	return (
		<a
			className={cn('launch_button !no-underline', className)}
			href={`${githubFileRoot}/${path}${lineNumber ? `#L${lineNumber}` : ''}`}
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
		void fetcher.submit(formData, { method: 'POST', action: '/launch-editor' })
	}

	const githubPath = getGithubRoot().replace(/\/tree\/|\/blob\//, '/edit/')

	return (
		<Link
			className="self-center font-mono text-sm"
			onClick={handleClick}
			target="_blank"
			to={`${githubPath}/${relativePath}`.replace(/\\/g, '/')}
		>
			<span className="@min-[720px]:hidden">Edit</span>
			<span className="hidden @min-[720px]:block @min-[900px]:hidden">
				Edit on GitHub
			</span>
			<span className="hidden @min-[900px]:block">
				Edit this page on GitHub
			</span>
		</Link>
	)
}

export const LaunchEditor = ENV.EPICSHOP_DEPLOYED
	? LaunchGitHub
	: LaunchEditorImpl
