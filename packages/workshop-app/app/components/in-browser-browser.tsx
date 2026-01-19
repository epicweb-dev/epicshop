import { clsx } from 'clsx'
import * as React from 'react'
import { useImperativeHandle, useRef, useState } from 'react'
import { Icon } from '#app/components/icons.tsx'
import { AppStarter, AppStopper, PortStopper } from '#app/routes/start.tsx'
import { useTheme } from '#app/routes/theme/index.tsx'
import { getBaseUrl } from '#app/utils/misc.tsx'
import { useRequestInfo } from '#app/utils/root-loader.ts'
import { LinkButton } from './button.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './ui/tooltip.tsx'

export type InBrowserBrowserRef = {
	handleExtrnalNavigation: (pathname?: string) => void
}

type Props = {
	id: string
	name: string
	port: number
	portIsAvailable: boolean | null
	isRunning: boolean
	baseUrl: string
	initialRoute: string
	ref?: React.Ref<InBrowserBrowserRef>
}

export function InBrowserBrowser({
	name,
	port,
	portIsAvailable,
	isRunning,
	baseUrl,
	id,
	initialRoute,
	ref,
}: Props) {
	const requestInfo = useRequestInfo()
	const [showUnmanaged, setShowUnmanaged] = useState(false)
	if (isRunning || showUnmanaged) {
		return (
			<InBrowserBrowserForRealz
				baseUrl={baseUrl}
				id={id}
				name={name}
				ref={ref}
				initialRoute={initialRoute}
			/>
		)
	} else if (portIsAvailable === false) {
		return (
			<div className="flex flex-col items-center justify-center">
				<p className="max-w-xs pb-5 text-center" role="status">
					{`The port for this app is unavailable. It could be that you're running it `}
					<a
						href={getBaseUrl({ domain: requestInfo.domain, port })}
						className="underline"
						target="_blank"
						rel="noreferrer"
					>
						elsewhere
					</a>
					{'. '}
					<LinkButton onClick={() => setShowUnmanaged(true)}>
						Show here anyway
					</LinkButton>
				</p>
				<PortStopper port={port} />
			</div>
		)
	} else {
		return (
			<div className="flex h-full flex-col items-center justify-center">
				<AppStarter name={name} />
			</div>
		)
	}
}
type RealBrowserProps = {
	baseUrl: string
	id: string
	name: string
	initialRoute: string
	ref?: React.Ref<InBrowserBrowserRef>
}

function InBrowserBrowserForRealz({
	baseUrl,
	id,
	name,
	initialRoute,
	ref,
}: RealBrowserProps) {
	const theme = useTheme()
	const [iframeKeyNumber, setIframeKeyNumber] = useState(0)
	const iframeKey = id + iframeKeyNumber
	const iframeRef = useRef<HTMLIFrameElement>(null)

	const appUrl = new URL(initialRoute, baseUrl)
	const [iframeSrcUrl, setIframeSrcUrl] = useState(appUrl)

	const currentId = useRef(id)
	if (currentId.current !== id) {
		currentId.current = id
		setIframeSrcUrl(appUrl)
	}

	function handleExtrnalNavigation(pathname?: string) {
		if (pathname) {
			const newUrl = new URL(pathname, baseUrl)
			setIframeSrcUrl(newUrl)
			setIframeKeyNumber((prev) => prev + 1)
		}
	}

	useImperativeHandle(ref, () => ({ handleExtrnalNavigation }))

	return (
		<TooltipProvider>
			<div className="flex h-full grow flex-col">
				<div className="flex items-center justify-between border-b pl-1.5">
					<div className="mr-2 flex items-center justify-center gap-2 px-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									className="flex aspect-square h-full w-full items-center justify-center p-1 transition disabled:opacity-40"
									onClick={() => {
										setIframeKeyNumber((prev) => prev + 1)
									}}
								>
									<Icon name="Refresh" aria-hidden="true" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Refresh</TooltipContent>
						</Tooltip>
					</div>
					<div className="bg-background text-foreground flex flex-1 items-center border-x p-3 leading-none">
						<a href={iframeSrcUrl.toString()} target="_blank" rel="noreferrer">
							{iframeSrcUrl.toString()}
						</a>
					</div>
					<AppStopper name={name} />
					<Tooltip>
						<TooltipTrigger asChild>
							<a
								href={iframeSrcUrl.toString()}
								target="_blank"
								rel="noreferrer"
								className={clsx(
									'flex aspect-square items-center justify-center px-3.5',
								)}
							>
								<Icon name="ExternalLink" />
							</a>
						</TooltipTrigger>
						<TooltipContent>Open in new tab</TooltipContent>
					</Tooltip>
				</div>
				<div className="bg-background flex h-full w-full grow">
					<iframe
						title={name}
						key={iframeKey}
						ref={iframeRef}
						src={iframeSrcUrl.toString()}
						className="bg-background h-full w-full grow"
						style={{ colorScheme: theme }}
						allow="clipboard-write"
					/>
				</div>
			</div>
		</TooltipProvider>
	)
}
