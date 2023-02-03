import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Form, useLoaderData, useSearchParams } from '@remix-run/react'
import type { NavigateFunction } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { requireExerciseApp } from '~/utils/misc.server'
import { isAppRunning, isPortAvailable } from '~/utils/process-manager.server'
import { AppStarter, AppStopper, PortStopper } from '../start'

export async function loader({ params }: DataFunctionArgs) {
	const app = await requireExerciseApp(params)

	const isRunning = isAppRunning(app)
	return json({
		isRunning,
		isPortAvailable: isRunning ? null : await isPortAvailable(app.portNumber),
		title: app.title,
		name: app.name,
		port: app.portNumber,
	})
}

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

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()
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
						]
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
							],
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
	return data.isRunning ? (
		<div>
			<AppStopper name={data.name} />
			<div className="flex gap-3 px-2">
				<button
					type="button"
					className={atStartOfHistory ? 'opacity-50' : ''}
					disabled={atStartOfHistory}
					onClick={() => navigateChild(-1)}
				>
					👈
				</button>
				<button
					type="button"
					className={atEndOfHistory ? 'opacity-50' : ''}
					disabled={atEndOfHistory}
					onClick={() => navigateChild(1)}
				>
					👉
				</button>
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
					<input
						aria-label="pathname"
						className="flex-1 border-2 border-blue-400"
						value={pathnameInputValue}
						name="pathname"
						onChange={e => setPathnameInputValue(e.currentTarget.value)}
					/>
					<button type="submit">Go</button>
				</Form>
			</div>
			<iframe
				title={data.title}
				key={iframeContext.key}
				ref={iframeRef}
				src={`http://localhost:${data.port}${iframeContext.pathname}`}
				className="h-full w-full border-2 border-stone-400"
			/>
		</div>
	) : data.isPortAvailable === false ? (
		<div>
			<div>
				The port for this app is unavailable. It could be that you're running it
				elsewhere?
			</div>
			<PortStopper port={data.port} />
		</div>
	) : (
		<AppStarter name={data.name} />
	)
}
