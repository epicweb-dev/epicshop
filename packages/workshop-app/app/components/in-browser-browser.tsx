import { Form, useSearchParams } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router'
import { z } from 'zod'
import { AppStarter, AppStopper, PortStopper } from '~/routes/start'
import { typedBoolean } from '~/utils/misc'
import Icon from '~/components/icons'
import clsx from 'clsx'

const historyCallDataSchema = z.intersection(
	z.object({
		type: z.literal('kcdshop:history-call'),
	}),
	z.union([
		z.object({
			method: z.literal('pushState'),
			args: z.union([
				z.tuple([z.object({}).passthrough(), z.unknown()]),
				z.tuple([z.object({}).passthrough(), z.unknown(), z.string()]),
			]),
		}),
		z.object({
			method: z.literal('replaceState'),
			args: z.union([
				z.tuple([z.object({}).passthrough(), z.unknown()]),
				z.tuple([z.object({}).passthrough(), z.unknown(), z.string()]),
			]),
		}),
		z.object({
			method: z.literal('go'),
			args: z.tuple([z.number().optional()]),
		}),
		z.object({ method: z.literal('forward'), args: z.tuple([]) }),
		z.object({ method: z.literal('back'), args: z.tuple([]) }),
		z.object({
			method: z.literal('popstate'),
			pathname: z.string(),
			delta: z.number(),
		}),
	]),
)

function getNewIndex(prevIndex: number, delta: number, max: number) {
	// keep the index bound between 0 and the history length
	return Math.min(Math.max(prevIndex + delta, 0), max)
}

export function InBrowserBrowser({
	name,
	port,
	portIsAvailable,
	isRunning,
	baseUrl,
}: {
	name: string
	port: number
	portIsAvailable: boolean | null
	isRunning: boolean
	baseUrl: string
}) {
	const [searchParams, setSearchParams] = useSearchParams()
	const searchParamsPathname = searchParams.get('pathname') ?? '/'
	const [iframeContext, setIFrameContext] = useState({
		key: 0,
		pathname: searchParamsPathname,
		history: [searchParamsPathname],
		index: 0,
	})
	const [pathnameInputValue, setPathnameInputValue] =
		useState(searchParamsPathname)
	const iframeRef = useRef<HTMLIFrameElement>(null)

	const appUrl = new URL(baseUrl)
	appUrl.pathname = searchParamsPathname

	const [initialIframeSrcUrl] = useState(appUrl)

	useEffect(() => {
		function handleMessage(messageEvent: MessageEvent) {
			if (messageEvent.source !== iframeRef.current?.contentWindow) return
			if (messageEvent.data.type !== 'kcdshop:history-call') return

			const data = historyCallDataSchema.parse(messageEvent.data, {
				path: ['messageEvent', 'data'],
			})

			const { method } = data
			setIFrameContext(prevContext => {
				const newIndex = (i: number) =>
					getNewIndex(prevContext.index, i, prevContext.history.length - 1)
				const currentPathname = prevContext.history[prevContext.index]
				switch (method) {
					case 'popstate': {
						return { ...prevContext, index: newIndex(data.delta) }
					}
					case 'forward': {
						return { ...prevContext, index: newIndex(1) }
					}
					case 'back': {
						return { ...prevContext, index: newIndex(-1) }
					}
					case 'pushState': {
						const pathname = data.args[2] ?? currentPathname
						const newHistory = [
							...prevContext.history.slice(0, prevContext.index + 1),
							pathname,
						].filter(typedBoolean)
						return {
							...prevContext,
							history: newHistory,
							index: newHistory.length - 1,
						}
					}
					case 'replaceState': {
						const pathname = data.args[2] ?? currentPathname
						return {
							...prevContext,
							history: [
								...prevContext.history.slice(0, prevContext.index),
								pathname,
								...prevContext.history.slice(prevContext.index + 1),
							].filter(typedBoolean),
						}
					}
					case 'go': {
						const [delta = 0] = data.args
						return { ...prevContext, index: newIndex(delta) }
					}
				}
			})
		}
		window.addEventListener('message', handleMessage)
		return () => {
			window.removeEventListener('message', handleMessage)
		}
	}, [])

	const iframePathname = iframeContext.history[iframeContext.index]
	useEffect(() => {
		if (!iframePathname) return

		setPathnameInputValue(iframePathname)

		const newSearchParams = new URLSearchParams(window.location.search)
		if (iframePathname === '/') {
			newSearchParams.delete('pathname')
		} else {
			newSearchParams.set('pathname', iframePathname)
		}
		const newSearch = newSearchParams.toString()
		if (newSearch !== window.location.search) {
			setSearchParams(newSearchParams, { replace: true })
		}
	}, [iframePathname])

	const navigateChild: NavigateFunction = (...params) => {
		iframeRef.current?.contentWindow?.postMessage(
			{ type: 'kcdshop:navigate-call', params },
			'*',
		)
	}

	const atEndOfHistory =
		iframeContext.index === iframeContext.history.length - 1
	const atStartOfHistory = iframeContext.index === 0
	const existingSearchParamHiddenInputs: Array<JSX.Element> = []
	for (const [key, value] of searchParams.entries()) {
		if (key === 'pathname') continue

		existingSearchParamHiddenInputs.push(
			<input key={key} type="hidden" name={key} value={value} />,
		)
	}
	return isRunning ? (
		<div className="flex h-full flex-grow flex-col">
			<div className="flex items-center justify-between border-b border-gray-200 pl-1.5">
				<div className="mr-2 flex items-center justify-center gap-2 px-1">
					<button
						type="button"
						className="flex aspect-square h-full w-full items-center justify-center p-1 transition disabled:opacity-40"
						disabled={atStartOfHistory}
						onClick={() => navigateChild(-1)}
					>
						<Icon name="ArrowLeft" aria-hidden="true" title="Go back" />
					</button>
					<button
						type="button"
						className="flex aspect-square h-full w-full items-center justify-center p-1 transition disabled:opacity-40"
						disabled={atEndOfHistory}
						onClick={() => navigateChild(1)}
					>
						<Icon name="ArrowRight" aria-hidden="true" title="Go forward" />
					</button>
					<button
						type="button"
						className="flex aspect-square h-full w-full items-center justify-center p-1 transition"
						onClick={() =>
							iframeRef.current?.contentWindow?.postMessage(
								{ type: 'kcdshop:refresh' },
								'*',
							)
						}
					>
						<Icon name="Refresh" aria-hidden="true" title="Refresh" />
					</button>
				</div>
				<Form
					method="get"
					replace
					className="flex flex-1 gap-2"
					onSubmit={() => {
						const currnetPathname = iframeContext.history[iframeContext.index]
						navigateChild(pathnameInputValue, {
							replace: currnetPathname === pathnameInputValue,
						})
					}}
				>
					{existingSearchParamHiddenInputs}
					<input
						aria-label="pathname"
						className="flex-1 border-x border-gray-200 p-3 leading-none focus-visible:outline-none"
						value={pathnameInputValue}
						name="pathname"
						onChange={e => setPathnameInputValue(e.currentTarget.value)}
					/>
					{/* TODO: Reconsider if this is needed as browsers don't usually have a submit button in address bar */}
					{/* <button type="submit">Go</button> */}
				</Form>
				<AppStopper name={name} />
				<a
					href={appUrl.toString()}
					target="_blank"
					rel="noreferrer"
					title="Open in new tab"
					className={clsx(
						'flex aspect-square items-center justify-center px-3.5',
					)}
				>
					<Icon name="ExternalLink" aria-hidden="true" />
					<span className="sr-only">Open in New Window</span>
				</a>
			</div>
			<div className="flex h-full w-full flex-grow overflow-y-scroll bg-white p-5">
				<iframe
					title={name}
					key={iframeContext.key}
					ref={iframeRef}
					src={initialIframeSrcUrl.toString()}
					className="h-full w-full flex-grow"
				/>
			</div>
		</div>
	) : portIsAvailable === false ? (
		<div className="flex flex-col items-center justify-center">
			<p className="max-w-xs pb-5 text-center" role="status">
				The port for this app is unavailable. It could be that you're running it
				<a href={`http://localhost:${port}`} className="underline">
					elsewhere
				</a>
				?
			</p>
			<PortStopper port={port} />
		</div>
	) : (
		<AppStarter name={name} />
	)
}
