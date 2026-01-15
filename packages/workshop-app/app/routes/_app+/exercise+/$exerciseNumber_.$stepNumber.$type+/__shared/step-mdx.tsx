import * as React from 'react'
import { type PropsWithChildren } from 'react'
import {
	Link,
	useLoaderData,
	useSearchParams,
	type LinkProps,
} from 'react-router'
import iconsSvg from '#app/assets/icons.svg'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { Icon } from '#app/components/icons.tsx'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn, getBaseUrl } from '#app/utils/misc.tsx'
import { useRequestInfo } from '#app/utils/root-loader.ts'
import { type loader } from '../_layout.tsx'

type StepContextType = {
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef | null>
}
const StepContext = React.createContext<StepContextType | null>(null)

function useStepContext() {
	const context = React.useContext(StepContext)
	if (!context) {
		throw new Error('useStepContext must be used within a StepContextProvider')
	}
	return context
}

function StepContextProvider({
	children,
	inBrowserBrowserRef,
}: {
	children: React.ReactNode
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef | null>
}) {
	return <StepContext value={{ inBrowserBrowserRef }}>{children}</StepContext>
}

const stepMdxComponents = {
	DiffLink,
	PrevDiffLink,
	NextDiffLink,
	InlineFile,
	LinkToApp,
}

export function StepMdx({
	inBrowserBrowserRef,
}: {
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef | null>
}) {
	const data = useLoaderData<typeof loader>()
	if (!data.exerciseStepApp.instructionsCode) return null
	return (
		<StepContextProvider inBrowserBrowserRef={inBrowserBrowserRef}>
			<EpicVideoInfoProvider epicVideoInfosPromise={data.epicVideoInfosPromise}>
				<div className="prose dark:prose-invert sm:prose-lg">
					<Mdx
						code={data.exerciseStepApp.instructionsCode}
						components={stepMdxComponents}
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

function NextDiffLink({
	app = 0,
	fullPage = false,
	children,
}: {
	app: number
	fullPage?: boolean
	children?: React.ReactNode
}) {
	return (
		<DiffLink app1={app} app2={app + 1} fullPage={fullPage}>
			{children}
		</DiffLink>
	)
}

function PrevDiffLink({
	app = -1,
	fullPage = false,
	children,
}: {
	app: number
	fullPage?: boolean
	children?: React.ReactNode
}) {
	return (
		<DiffLink app1={app} app2={app + 1} fullPage={fullPage}>
			{children}
		</DiffLink>
	)
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
		children = (
			<span>
				Go to Diff {fullPage ? '' : 'Preview'} from: <code>{app1Name}</code> to:{' '}
				<code>{app2Name}</code>
			</span>
		)
	}

	return <Link to={pathToDiff}>{children}</Link>
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
		<div className="launch-editor-button-wrapper flex underline underline-offset-4">
			{children}{' '}
			<svg height={24} width={24}>
				<use href={`${iconsSvg}#Keyboard`} />
			</svg>
		</div>
	)

	return ENV.EPICSHOP_DEPLOYED && app ? (
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

function getPreviewType(
	preview: string | null,
): 'playground' | 'problem' | 'solution' {
	if (preview === 'problem') return 'problem'
	if (preview === 'solution') return 'solution'
	return 'playground'
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
	const type = getPreviewType(searchParams.get('preview'))
	const requestInfo = useRequestInfo()
	const app = data[type]
	const previewAppUrl =
		app?.dev.type === 'script'
			? getBaseUrl({
					domain: requestInfo.domain,
					port: app.dev.portNumber,
				})
			: data.playground?.dev.type === 'browser' ||
				  data.playground?.dev.type === 'export'
				? data.playground.dev.pathname
				: null
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
					'cursor-not-allowed': ENV.EPICSHOP_DEPLOYED,
				})}
				title={
					ENV.EPICSHOP_DEPLOYED
						? 'Cannot link to app in deployed version'
						: undefined
				}
				onClick={(event) => {
					if (ENV.EPICSHOP_DEPLOYED) event.preventDefault()

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
							'cursor-not-allowed': ENV.EPICSHOP_DEPLOYED,
						})}
						title={
							ENV.EPICSHOP_DEPLOYED
								? 'Cannot link to app in deployed version'
								: 'Open in new tab'
						}
						onClick={(event) => {
							if (ENV.EPICSHOP_DEPLOYED) event.preventDefault()
						}}
					>
						<Icon name="ExternalLink" />
					</a>
				</SimpleTooltip>
			) : null}
		</div>
	)
}
