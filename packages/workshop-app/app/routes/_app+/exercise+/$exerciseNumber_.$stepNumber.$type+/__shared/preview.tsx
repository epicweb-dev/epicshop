import { type BaseExerciseStepApp } from '@epic-web/workshop-utils/apps.server'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '#app/components/icons'
import {
	InBrowserBrowser,
	type InBrowserBrowserRef,
} from '#app/components/in-browser-browser.tsx'
import { Loading } from '#app/components/loading.tsx'
import { useTheme } from '#app/routes/theme/index.tsx'
import { cn, getBaseUrl } from '#app/utils/misc.tsx'
import { useRequestInfo } from '#app/utils/root-loader.ts'

export function Preview({
	id,
	appInfo,
	inBrowserBrowserRef,
}: {
	id?: string
	appInfo: {
		isRunning: boolean
		appName?: string
		name: string
		title: string
		portIsAvailable: boolean | null
		type: string
		fullPath: string
		dev: BaseExerciseStepApp['dev']
		test: BaseExerciseStepApp['test']
		stackBlitzUrl: BaseExerciseStepApp['stackBlitzUrl']
	} | null
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef | null>
}) {
	const requestInfo = useRequestInfo()
	const [searchParams] = useSearchParams()
	const theme = useTheme()
	if (!appInfo) return <p>No app here. Sorry.</p>
	const { isRunning, dev, name, portIsAvailable, title } = appInfo

	if (ENV.EPICSHOP_DEPLOYED && appInfo.stackBlitzUrl) {
		const url = new URL(appInfo.stackBlitzUrl)
		url.searchParams.set('embed', '1')
		url.searchParams.set('theme', theme)

		return (
			<StackBlitzEmbed
				title={title}
				url={url.toString()}
				loadingContent={
					<Loading>
						<span>
							Loading{' '}
							<a className="underline" href={appInfo.stackBlitzUrl}>
								"{title}"
							</a>
						</span>
					</Loading>
				}
			/>
		)
	}

	if (dev.type === 'script') {
		const baseUrl = getBaseUrl({
			domain: requestInfo.domain,
			port: dev.portNumber,
		})
		return (
			<InBrowserBrowser
				ref={inBrowserBrowserRef}
				isRunning={isRunning}
				id={id ?? name}
				name={name}
				portIsAvailable={portIsAvailable}
				port={dev.portNumber}
				baseUrl={baseUrl}
				initialRoute={searchParams.get('pathname') ?? dev.initialRoute}
			/>
		)
	} else if (dev.type === 'browser') {
		return (
			<div className="scrollbar-thin scrollbar-thumb-scrollbar relative h-full grow overflow-y-auto">
				<a
					href={dev.pathname}
					target="_blank"
					rel="noreferrer"
					className={cn(
						'absolute right-5 bottom-5 flex items-center justify-center rounded-full bg-gray-100 p-2.5 transition hover:bg-gray-200 dark:bg-gray-800 hover:dark:bg-gray-600',
					)}
				>
					<Icon name="ExternalLink" aria-hidden="true" />
					<span className="sr-only">Open in New Window</span>
				</a>
				<iframe
					title={title}
					src={dev.pathname}
					className="yo yo h-full w-full grow bg-white"
					style={{ colorScheme: theme }}
					allow="clipboard-write"
				/>
			</div>
		)
	} else {
		return (
			<div className="flex h-full items-center justify-center text-lg">
				<p>
					Preview for dev type of <code>{dev.type}</code> not supported.
				</p>
			</div>
		)
	}
}

export function StackBlitzEmbed({
	url,
	title,
	loadingContent,
}: {
	url: string
	title?: string
	loadingContent: React.ReactNode
}) {
	const theme = useTheme()
	const [iframeLoaded, setIframeLoaded] = useState(false)

	return (
		<div className="h-full w-full grow">
			{iframeLoaded ? null : (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					{loadingContent}
				</div>
			)}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				// show what would have shown if there is an error
				onError={() => setIframeLoaded(true)}
				src={url}
				className={cn(
					'h-full w-full grow transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
				title={title}
				sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
				allow="clipboard-write"
				style={{ colorScheme: theme }}
			/>
		</div>
	)
}
