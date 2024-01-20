import {
	Link,
	useLoaderData,
	useSearchParams,
	type LinkProps,
} from '@remix-run/react'
import { clsx } from 'clsx'
import * as React from 'react'
import { useState, type PropsWithChildren } from 'react'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { Icon } from '#app/components/icons.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import { UpdateMdxCache } from '#app/routes/update-mdx-cache.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn, getBaseUrl } from '#app/utils/misc.tsx'
import { useRequestInfo } from '#app/utils/request-info.ts'
import { type loader } from '../_layout.tsx'

type StepContextType = {
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
}
const StepContext = React.createContext<StepContextType | null>(null)

function useStepContext() {
	const context = React.useContext(StepContext)
	if (!context) {
		throw new Error('useStepContext must be used within a StepContext.Provider')
	}
	return context
}

function StepContextProvider({
	children,
	inBrowserBrowserRef,
}: {
	children: React.ReactNode
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
}) {
	return (
		<StepContext.Provider value={{ inBrowserBrowserRef }}>
			{children}
		</StepContext.Provider>
	)
}

export function StepMdx({
	inBrowserBrowserRef,
}: {
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
}) {
	const data = useLoaderData<typeof loader>()
	if (!data.exerciseStepApp?.instructionsCode) return null
	return (
		<StepContextProvider inBrowserBrowserRef={inBrowserBrowserRef}>
			<EpicVideoInfoProvider epicVideoInfosPromise={data.epicVideoInfosPromise}>
				<div className="prose dark:prose-invert sm:prose-lg">
					<Mdx
						code={data.exerciseStepApp?.instructionsCode}
						components={{
							CodeFile,
							CodeFileNotification,
							DiffLink,
							InlineFile,
							LinkToApp,
						}}
					/>
				</div>
			</EpicVideoInfoProvider>
		</StepContextProvider>
	)
}

function withParam(
	searchParams: URLSearchParams,
	key: string,
	value: string | null,
) {
	const newSearchParams = new URLSearchParams(searchParams)
	if (value === null) {
		newSearchParams.delete(key)
	} else {
		newSearchParams.set(key, value)
	}
	return newSearchParams
}

function DiffLink({
	app1 = 0,
	app2 = 1,
	children,
	fullPage = false,
	to,
}: {
	app1?: string | number | null
	app2?: string | number | null
	to?: string
	fullPage?: boolean
	children?: React.ReactNode
}) {
	const data = useLoaderData<typeof loader>()
	if (!to && !app1 && !app2) {
		return (
			<callout-danger className="notification">
				<div className="title">DiffLink Error: invalid input</div>
			</callout-danger>
		)
	}

	function getAppName(input: typeof app1) {
		if (typeof input === 'number') {
			const stepIndex = data.exerciseIndex + input
			return data.allApps[stepIndex]?.name
		}
		if (!input) return null
		for (const { name, stepName } of data.allApps) {
			if (input === name || input === stepName) {
				return name
			}
		}
		return null
	}

	if (to) {
		const params = new URLSearchParams(to)
		app1 = params.get('app1')
		app2 = params.get('app2')
	}
	const app1Name = getAppName(app1)
	const app2Name = getAppName(app2)
	if (!app1Name || !app2Name) {
		return (
			<callout-danger className="notification">
				<div className="title">DiffLink Error: invalid input</div>
				{!app1Name && <div>app1: "{app1}" is not a valid app name</div>}
				{!app2Name && <div>app2: "{app2}" is not a valid app name</div>}
			</callout-danger>
		)
	}

	if (!to) {
		to = `app1=${app1Name}&app2=${app2Name}`
	}
	const pathToDiff = fullPage
		? `/diff?${to}`
		: `?${decodeURIComponent(
				withParam(new URLSearchParams(), 'preview', `diff&${to}`).toString(),
			)}`

	if (!children) {
		const msg = (s: string) => s.split('__sep__')[2] ?? ''
		children = (
			<span>
				Go to Diff {fullPage ? '' : 'Preview'} from:{' '}
				<code>{msg(app1Name)}</code> to: <code>{msg(app2Name)}</code>
			</span>
		)
	}

	return <Link to={pathToDiff}>{children}</Link>
}

function CodeFile({ file }: { file: string }) {
	return (
		<div className="border-4 border-[#ff4545] bg-[#ff454519] p-4 text-lg">
			Something went wrong compiling <b>CodeFile</b> for file: <u>{file}</u> to
			markdown
		</div>
	)
}

function CodeFileNotification({
	file,
	type = 'problem',
	children,
	variant,
	cacheLocation,
	embeddedKey,
	...props
}: {
	file: string
	type?: 'solution' | 'problem'
	children: React.ReactNode
} & (
	| {
			variant: 'error'
			cacheLocation?: never
			embeddedKey?: never
	  }
	| {
			variant: 'warning'
			cacheLocation: string
			embeddedKey: string
	  }
)) {
	const [visibility, setVisibility] = useState('visible')
	const data = useLoaderData<typeof loader>()
	const app = data[type]

	const handleClick = () => {
		if (visibility !== 'visible') return
		setVisibility('collapse')
		setTimeout(() => {
			setVisibility('none')
		}, 400)
	}

	const className = clsx(
		'rounded px-4 py-1 font-mono text-sm font-semibold outline-none transition duration-300 ease-in-out',
		{
			'bg-amber-300/70 hover:bg-amber-300/40 active:bg-amber-300/50':
				variant === 'warning',
			'bg-red-300/70 hover:bg-red-300/40 active:bg-red-300/50':
				variant === 'error',
		},
	)

	return (
		<div
			className={clsx('notification important h-15 relative', {
				'duration-400 !my-0 !h-0 !py-0 !opacity-0 transition-all ease-out':
					visibility !== 'visible',
				hidden: visibility === 'none',
			})}
		>
			<div className="absolute right-3 top-3 z-50 flex gap-4">
				{app ? (
					<div className={className} title={`Edit ${file}`}>
						<LaunchEditor appFile={file} appName={app.name} {...props}>
							Edit this File
						</LaunchEditor>
					</div>
				) : null}
				{app && variant === 'warning' ? (
					<div
						className={className}
						title={`Remove the warning from here and from ${file} cache file`}
					>
						<UpdateMdxCache
							handleClick={handleClick}
							cacheLocation={cacheLocation}
							embeddedKey={embeddedKey}
							appFullPath={app.fullPath}
						/>
					</div>
				) : null}
			</div>
			{children}
		</div>
	)
}

function InlineFile({
	file,
	type = 'playground',
	children = <code>{file}</code>,
	...props
}: Omit<PropsWithChildren<typeof LaunchEditor>, 'appName'> & {
	file: string
	type?: 'playground' | 'solution' | 'problem'
}) {
	const data = useLoaderData<typeof loader>()
	const app = data[type] || data[data.type]

	const info = (
		<div className="launch-editor-button-wrapper flex underline">
			{children}{' '}
			<svg height={24} width={24}>
				<use href={`/icons.svg#keyboard`} />
			</svg>
		</div>
	)

	return ENV.KCDSHOP_DEPLOYED && app ? (
		<div className="inline-block grow">
			<LaunchEditor appFile={file} appName={app.name} {...props}>
				{info}
			</LaunchEditor>
		</div>
	) : app ? (
		<div className="inline-block grow">
			<LaunchEditor appFile={file} appName={app.name} {...props}>
				{info}
			</LaunchEditor>
		</div>
	) : type === 'playground' ? (
		// playground does not exist yet
		<SimpleTooltip content="You must 'Set to Playground' before opening a file">
			<div className="inline-block grow cursor-not-allowed">{info}</div>
		</SimpleTooltip>
	) : (
		<>children</>
	)
}

function LinkToApp({
	to: appTo,
	children = <code>{appTo.toString()}</code>,
	...props
}: LinkProps) {
	const [searchParams] = useSearchParams()
	const to = `?${withParam(
		searchParams,
		'pathname',
		appTo.toString(),
	).toString()}`
	const data = useLoaderData<typeof loader>()
	const requestInfo = useRequestInfo()
	const previewAppUrl =
		data.playground?.dev.type === 'script'
			? getBaseUrl({
					domain: requestInfo.domain,
					port: data.playground.dev.portNumber,
				})
			: data.playground?.dev.pathname
	const { inBrowserBrowserRef } = useStepContext()
	const href = previewAppUrl
		? previewAppUrl.slice(0, -1) + appTo.toString()
		: null
	return (
		<div className="inline-flex items-center justify-between gap-1">
			<Link
				to={to}
				{...props}
				className={cn(props.className, {
					'cursor-not-allowed': ENV.KCDSHOP_DEPLOYED,
				})}
				title={
					ENV.KCDSHOP_DEPLOYED
						? 'Cannot link to app in deployed version'
						: undefined
				}
				onClick={event => {
					if (ENV.KCDSHOP_DEPLOYED) event.preventDefault()

					props.onClick?.(event)
					inBrowserBrowserRef.current?.handleExtrnalNavigation(appTo.toString())
				}}
			>
				{children}
			</Link>
			{href ? (
				<SimpleTooltip content="Open in new tab">
					<a
						href={href}
						target="_blank"
						rel="noreferrer"
						className={cn('flex aspect-square items-center justify-center', {
							'cursor-not-allowed': ENV.KCDSHOP_DEPLOYED,
						})}
						title={
							ENV.KCDSHOP_DEPLOYED
								? 'Cannot link to app in deployed version'
								: 'Open in new tab'
						}
						onClick={event => {
							if (ENV.KCDSHOP_DEPLOYED) event.preventDefault()
						}}
					>
						<Icon name="ExternalLink" />
					</a>
				</SimpleTooltip>
			) : null}
		</div>
	)
}
