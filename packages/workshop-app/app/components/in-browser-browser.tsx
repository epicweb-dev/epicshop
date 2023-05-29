import { Form, useSearchParams } from '@remix-run/react'
import {
	useEffect,
	forwardRef,
	useImperativeHandle,
	useRef,
	useState,
	type ForwardedRef,
} from 'react'
import type { NavigateFunction } from 'react-router'
import { z } from 'zod'
import { AppStarter, AppStopper, PortStopper } from '~/routes/start.tsx'
import { typedBoolean } from '~/utils/misc.tsx'
import Icon from '~/components/icons.tsx'
import { clsx } from 'clsx'

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

const loadedSchema = z.object({
	type: z.literal('kcdshop:loaded'),
	url: z.string(),
})

const messageSchema = z.union([historyCallDataSchema, loadedSchema])

function getNewIndex(prevIndex: number, delta: number, max: number) {
	// keep the index bound between 0 and the history length
	return Math.min(Math.max(prevIndex + delta, 0), max)
}

type Props = {
	name: string
	port: number
	portIsAvailable: boolean | null
	isRunning: boolean
	baseUrl: string
}

export type InBrowserBrowserRef = {
	handleExtrnalNavigation: (pathname?: string) => void
}

export const InBrowserBrowser = forwardRef<InBrowserBrowserRef, Props>(
	InBrowserBrowserImpl,
)

function InBrowserBrowserImpl(
	{ name, port, portIsAvailable, isRunning, baseUrl }: Props,
	ref: ForwardedRef<InBrowserBrowserRef>,
) {
	const [searchParams, setSearchParams] = useSearchParams()
	const searchParamsPathname = searchParams.get('pathname') ?? '/'
	const [iframeKey, setIframeKey] = useState(0)
	const lastDirectionRef = useRef<'forward' | 'back' | 'new'>('new')
	const lastDirectionTimeout = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	)
	const [iframeContext, setIFrameContext] = useState({
		history: [searchParamsPathname],
		index: 0,
	})
	const [pathnameInputValue, setPathnameInputValue] =
		useState(searchParamsPathname)
	const iframeRef = useRef<HTMLIFrameElement>(null)

	const appUrl = new URL(baseUrl)
	appUrl.pathname = searchParamsPathname

	/** changing the iframeSrcUrl will trigger a reload of the iframe */
	const [iframeSrcUrl, setIframeSrcUrl] = useState(appUrl)

	useEffect(() => {
		function handleMessage(messageEvent: MessageEvent) {
			if (messageEvent.source !== iframeRef.current?.contentWindow) return

			const result = messageSchema.safeParse(messageEvent.data, {
				path: ['messageEvent', 'data'],
			})
			if (!result.success) return
			const { data } = result

			if (data.type === 'kcdshop:loaded') {
				setIFrameContext(prevContext => {
					const newIndex = (i: number) =>
						getNewIndex(prevContext.index, i, prevContext.history.length - 1)
					if (lastDirectionRef.current === 'back') {
						return { ...prevContext, index: newIndex(-1) }
					} else if (lastDirectionRef.current === 'forward') {
						return { ...prevContext, index: newIndex(1) }
					} else if (lastDirectionRef.current === 'new') {
						const currentPathname = prevContext.history[prevContext.index]
						const newPathname = new URL(data.url).pathname
						if (currentPathname === newPathname) return prevContext

						const newHistory = [
							...prevContext.history.slice(0, prevContext.index + 1),
							newPathname,
						]
						return {
							history: newHistory,
							index: newHistory.length - 1,
						}
					} else {
						throw new Error('Unexpected lastDirectionRef value')
					}
				})
				return
			}

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

	// setSearchParams is unstable
	// https://github.com/remix-run/react-router/issues/9991
	const setSearchParamsLatestRef = useRef(setSearchParams)
	useEffect(() => {
		setSearchParamsLatestRef.current = setSearchParams
	}, [setSearchParams])

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
			setSearchParamsLatestRef.current(newSearchParams, { replace: true })
		}
	}, [iframePathname])

	const navigateChild: NavigateFunction = (...params) => {
		const to = params[0]
		if (typeof to === 'number') {
			// this part feels very brittle to me...
			lastDirectionRef.current = to > 0 ? 'forward' : 'back'
		} else {
			lastDirectionRef.current = 'new'
		}
		if (lastDirectionTimeout.current) {
			clearTimeout(lastDirectionTimeout.current)
		}
		lastDirectionTimeout.current = setTimeout(() => {
			lastDirectionRef.current = 'new'
		}, 100)
		iframeRef.current?.contentWindow?.postMessage(
			{ type: 'kcdshop:navigate-call', params },
			'*',
		)
	}

	function handleExtrnalNavigation(
		newPathnameInputValue: string = pathnameInputValue,
	) {
		setPathnameInputValue(newPathnameInputValue)

		const currentPathname = iframeContext.history[iframeContext.index]
		navigateChild(newPathnameInputValue, {
			replace: currentPathname === newPathnameInputValue,
		})
	}

	useImperativeHandle(ref, () => ({ handleExtrnalNavigation }))

	const atEndOfHistory =
		iframeContext.index === iframeContext.history.length - 1
	const atStartOfHistory = iframeContext.index <= 0
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
						className="flex aspect-square h-full w-full items-center justify-center p-1 transition disabled:opacity-40"
						onClick={() => {
							setIframeSrcUrl(appUrl)
							setIframeKey(iframeKey + 1)
							// TODO: figure out how we can avoid having to do this...
							// I stayed up for hours one night trying and couldn't work out
							// why react router wouldn't update the UI when using back/forward
							// after a refresh.
							setIFrameContext({
								history: [appUrl.pathname],
								index: 0,
							})
						}}
					>
						<Icon name="Refresh" aria-hidden="true" title="Refresh" />
					</button>
				</div>
				<Form
					method="get"
					replace
					className="flex flex-1 gap-2"
					onSubmit={() => handleExtrnalNavigation()}
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
					<Icon name="ExternalLink" title="Open in new tab" />
				</a>
			</div>
			<div className="flex h-full w-full flex-grow bg-white p-5">
				<iframe
					title={name}
					key={iframeKey}
					ref={iframeRef}
					src={iframeSrcUrl.toString()}
					className="h-full w-full flex-grow"
				/>
			</div>
		</div>
	) : portIsAvailable === false ? (
		<div className="flex flex-col items-center justify-center">
			<p className="max-w-xs pb-5 text-center" role="status">
				{`The port for this app is unavailable. It could be that you're running it `}
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
