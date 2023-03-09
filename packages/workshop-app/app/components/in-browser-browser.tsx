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
	const [searchParams] = useSearchParams()
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
						const [, , pathname = currentPathname] = data.args
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
						const [, , pathname = currentPathname] = data.args
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
			window.history.replaceState(
				{},
				'',
				`${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`,
			)
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
						className={clsx(
							'flex aspect-square h-full w-full items-center justify-center p-1 transition',
							{
								'opacity-40': atStartOfHistory,
								'': !atStartOfHistory,
							},
						)}
						disabled={atStartOfHistory}
						onClick={() => navigateChild(-1)}
					>
						<Icon name="ArrowLeft" aria-hidden="true" />
						<span className="sr-only">Go back</span>
					</button>
					<button
						type="button"
						className={clsx(
							'flex aspect-square h-full w-full items-center justify-center p-1 transition',
							{
								'opacity-40': atStartOfHistory,
								'': !atStartOfHistory,
							},
						)}
						disabled={atEndOfHistory}
						onClick={() => navigateChild(1)}
					>
						<Icon name="ArrowRight" aria-hidden="true" />
						<span className="sr-only">Go forward</span>
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
				<AppStopper
					name={name}
					className="h-full border-r border-gray-200 py-4 px-3 font-mono text-xs uppercase leading-none"
				/>
				<a
					href={baseUrl}
					target="_blank"
					rel="noreferrer"
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
					src={baseUrl}
					className="h-full w-full flex-grow"
				/>
			</div>
		</div>
	) : portIsAvailable === false ? (
		<div className="flex flex-col items-center justify-center">
			<p className="max-w-xs pb-5 text-center" role="status">
				The port for this app is unavailable. It could be that you're running it
				elsewhere?
			</p>
			<PortStopper port={port} />
		</div>
	) : (
		<AppStarter
			name={name}
			className="clip-path-button rounded-sm bg-black px-8 py-4 font-mono text-sm uppercase text-white"
		/>
	)
}
