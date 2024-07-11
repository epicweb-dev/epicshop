import { type BaseExerciseStepApp } from '@epic-web/workshop-utils/apps.server'
import { Icon } from '#app/components/icons'
import {
	InBrowserBrowser,
	type InBrowserBrowserRef,
} from '#app/components/in-browser-browser'
import { cn, getBaseUrl } from '#app/utils/misc'
import { useRequestInfo } from '#app/utils/request-info'
import { useTheme } from '#app/routes/theme/index.js'

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
	if (!appInfo) return <p>No app here. Sorry.</p>
	const { isRunning, dev, name, portIsAvailable, title } = appInfo
	const theme = useTheme()

	if (ENV.EPICSHOP_DEPLOYED && appInfo.stackBlitzUrl) {
		const url = new URL(appInfo.stackBlitzUrl)
		url.searchParams.set('embed', '1')
		url.searchParams.set('theme', theme)
		return (
			<div className="relative h-full flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar">
				<a
					href={url.toString()}
					target="_blank"
					rel="noreferrer"
					className={cn(
						'absolute bottom-5 right-5 flex items-center justify-center rounded-full bg-gray-100 p-2.5 transition hover:bg-gray-200 dark:bg-gray-800 hover:dark:bg-gray-600',
					)}
				>
					<Icon name="ExternalLink" aria-hidden="true" />
					<span className="sr-only">Open in New Window</span>
				</a>
				<iframe
					title={title}
					src={url.toString()}
					className="h-full w-full flex-grow bg-white"
				/>
			</div>
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
				initialRoute={dev.initialRoute}
			/>
		)
	} else if (dev.type === 'browser') {
		return (
			<div className="relative h-full flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar">
				<a
					href={dev.pathname}
					target="_blank"
					rel="noreferrer"
					className={cn(
						'absolute bottom-5 right-5 flex items-center justify-center rounded-full bg-gray-100 p-2.5 transition hover:bg-gray-200 dark:bg-gray-800 hover:dark:bg-gray-600',
					)}
				>
					<Icon name="ExternalLink" aria-hidden="true" />
					<span className="sr-only">Open in New Window</span>
				</a>
				<iframe
					title={title}
					src={dev.pathname}
					className="h-full w-full flex-grow bg-white"
				/>
			</div>
		)
	} else {
		return (
			<p>
				Preview for dev type of <code>{dev.type}</code> not supported.
			</p>
		)
	}
}
