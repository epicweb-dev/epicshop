import { type BaseExerciseStepApp } from '@epic-web/workshop-utils/apps.server'
import { Icon } from '#app/components/icons'
import {
	InBrowserBrowser,
	type InBrowserBrowserRef,
} from '#app/components/in-browser-browser'
import { cn, getBaseUrl } from '#app/utils/misc'
import { useRequestInfo } from '#app/utils/request-info'

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
	} | null
	inBrowserBrowserRef: React.RefObject<InBrowserBrowserRef>
}) {
	const requestInfo = useRequestInfo()
	if (!appInfo) return <p>No app here. Sorry.</p>
	const { isRunning, dev, name, portIsAvailable, title } = appInfo

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
						'absolute bottom-5 right-5 flex items-center justify-center rounded-full bg-gray-100 p-2.5 transition hover:bg-gray-200',
					)}
				>
					<Icon name="ExternalLink" aria-hidden="true" />
					<span className="sr-only">Open in New Window</span>
				</a>
				<iframe
					title={title}
					src={dev.pathname}
					className="h-full w-full flex-grow bg-white p-3"
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
