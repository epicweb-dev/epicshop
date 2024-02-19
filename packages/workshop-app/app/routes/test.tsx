import { getAppByName } from '@kentcdodds/workshop-utils/apps.server'
import {
	clearTestProcessEntry,
	getTestProcessEntry,
	isTestRunning,
	runAppTests,
} from '@kentcdodds/workshop-utils/process-manager.server'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
} from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import AnsiToHTML from 'ansi-to-html'
import escapeHtml from 'lodash.escape'
import { useEffect, useReducer, useRef } from 'react'
import { useEventSource } from 'remix-utils/sse/react'
import { eventStream } from 'remix-utils/sse/server'
import { z } from 'zod'
import { Icon, AnimatedBars } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { ensureUndeployed } from '#app/utils/misc.tsx'

const testActionSchema = z.union([
	z.object({
		intent: z.literal('run'),
		name: z.string(),
	}),
	z.object({
		intent: z.literal('stop'),
		name: z.string(),
	}),
	z.object({
		intent: z.literal('clear'),
		name: z.string(),
	}),
])

const testEventSchema = z.union([
	z.object({
		type: z.literal('init'),
		exitCode: z.number().nullable().optional(),
		isRunning: z.boolean(),
		output: z.array(
			z.object({
				type: z.union([z.literal('stdout'), z.literal('stderr')]),
				html: z.string(),
				timestamp: z.number(),
			}),
		),
	}),
	z.object({
		type: z.union([z.literal('stdout'), z.literal('stderr')]),
		data: z.string(),
		timestamp: z.number(),
	}),
	z.object({
		type: z.literal('exit'),
		isRunning: z.literal(false),
		code: z.number().nullable(),
	}),
])
const testEventQueueSchema = z.array(testEventSchema)

type TestEvent = z.infer<typeof testEventSchema>
type TestEventQueue = z.infer<typeof testEventQueueSchema>

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	const url = new URL(request.url)
	const name = url.searchParams.get('name')
	if (!name) {
		return json({ error: 'Missing name' }, { status: 400 })
	}
	const app = await getAppByName(name)
	if (!app) {
		return json({ error: 'App not found' }, { status: 404 })
	}
	const processEntry = getTestProcessEntry(app)
	if (!processEntry) {
		return json({ error: 'App is not running tests' }, { status: 404 })
	}
	return eventStream(request.signal, function setup(send) {
		const ansi = new AnsiToHTML()
		// have to batch because the client may miss events if we send too many
		// too rapidly
		let queue: TestEventQueue = []
		function sendEvent(event: TestEvent) {
			queue.push(event)
		}
		const interval = setInterval(() => {
			if (queue.length) {
				send({ data: JSON.stringify(queue) })
				queue = []
			}
		}, 10)

		const isRunning = isTestRunning(app)

		sendEvent({
			type: 'init',
			exitCode: processEntry.exitCode,
			isRunning,
			output: processEntry.output.map(line => ({
				type: line.type,
				html: ansi.toHtml(escapeHtml(line.content)),
				timestamp: line.timestamp,
			})),
		})

		const testProcess = processEntry.process
		if (!testProcess) {
			return () => {}
		}

		function handleStdOutData(data: Buffer) {
			sendEvent({
				type: 'stdout',
				data: ansi.toHtml(escapeHtml(data.toString('utf-8'))),
				timestamp: Date.now(),
			})
		}
		function handleStdErrData(data: Buffer) {
			sendEvent({
				type: 'stderr',
				data: ansi.toHtml(escapeHtml(data.toString('utf-8'))),
				timestamp: Date.now(),
			})
		}
		function handleExit(code: number) {
			testProcess?.stdout?.off('data', handleStdOutData)
			testProcess?.stderr?.off('data', handleStdErrData)
			testProcess?.off('exit', handleExit)
			sendEvent({ type: 'exit', isRunning: false, code })
		}
		testProcess.stdout?.on('data', handleStdOutData)
		testProcess.stderr?.on('data', handleStdErrData)
		testProcess.on('exit', handleExit)
		return function cleanup() {
			testProcess.stdout?.off('data', handleStdOutData)
			testProcess.stderr?.off('data', handleStdErrData)
			testProcess.off('exit', handleExit)
			clearInterval(interval)
		}
	})
}

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const result = testActionSchema.safeParse({
		intent: formData.get('intent'),
		name: formData.get('name'),
	})
	if (!result.success) {
		return json(
			{ success: false, error: result.error.flatten() },
			{ status: 400 },
		)
	}
	const app = await getAppByName(result.data.name)
	if (!app) {
		return json({ success: false, error: 'App not found' }, { status: 404 })
	}
	switch (result.data.intent) {
		case 'run': {
			void runAppTests(app)
			return json({ success: true })
		}
		case 'stop': {
			const processEntry = getTestProcessEntry(app)
			if (processEntry) {
				processEntry.process?.kill()
			}
			return json({ success: true })
		}
		case 'clear': {
			clearTestProcessEntry(app)
			return json({ success: true })
		}
	}
}

function simpleReducer<State>(prev: State, getNext: (prev: State) => State) {
	return getNext(prev)
}

export function TestOutput({ name }: { name: string }) {
	type State = {
		/** version is used to trigger an unsubscribe and resubscribe to the event source */
		version: number
		isRunning: boolean
		exitCode: number | null | undefined
		lines: Array<{ type: 'stdout' | 'stderr'; html: string; timestamp: number }>
	}
	const [state, dispatch] = useReducer(simpleReducer<State>, {
		version: 0,
		isRunning: false,
		exitCode: undefined,
		lines: [],
	})
	const { version, isRunning, exitCode, lines } = state
	const lastMessage = useEventSource(
		`/test?${new URLSearchParams({ name })}&v=${version}`,
	)
	useEffect(() => {
		if (!lastMessage) return

		const parsed = JSON.parse(lastMessage)
		const result = testEventQueueSchema.safeParse(parsed)
		if (!result.success) {
			console.error(result.error.flatten())
			return
		}
		for (const event of result.data) {
			switch (event.type) {
				case 'exit': {
					const { isRunning, code: exitCode } = event
					dispatch(prev => ({ ...prev, isRunning, exitCode }))
					break
				}
				case 'init': {
					const { output, exitCode, isRunning } = event
					dispatch(prev => ({ ...prev, lines: output, exitCode, isRunning }))
					break
				}
				case 'stderr':
				case 'stdout': {
					const { type, data: html, timestamp } = event
					dispatch(prev => ({
						...prev,
						lines: [...prev.lines, { type, html, timestamp }].sort(
							(a, b) => a.timestamp - b.timestamp,
						),
						isRunning: true,
					}))
					break
				}
			}
		}
	}, [lastMessage])

	return (
		<div className="relative flex h-full w-full flex-col">
			<div className="flex h-12 w-full flex-shrink-0 items-center justify-between border-b">
				<div className="flex h-full items-center">
					{!isRunning && (
						<TestRunner
							name={name}
							onRun={() => {
								dispatch(prev => ({
									...prev,
									exitCode: undefined,
									lines: [],
									version: prev.version + 1,
								}))
							}}
						/>
					)}
					{isRunning ? (
						<>
							<div className="flex h-full flex-grow items-center justify-center border-r px-3.5">
								<AnimatedBars role="status" aria-label="Running Tests" />
							</div>
							<StopTest name={name} />
						</>
					) : null}
				</div>

				{!isRunning && exitCode !== undefined && (
					<p className="pr-3.5 leading-none">
						{exitCode === 0
							? `Tests passed`
							: `Test failed (exit code ${String(exitCode)})`}
					</p>
				)}
				{!isRunning && exitCode !== undefined && (
					<ClearTest
						name={name}
						onClear={() => {
							dispatch(prev => ({
								...prev,
								exitCode: undefined,
								lines: [],
							}))
						}}
					/>
				)}
			</div>
			<div className="flex h-full flex-col gap-5 p-5">
				<p className="font-mono text-sm font-medium uppercase">Test Output</p>
				<pre className="shadow-on-scrollbox flex-1 overflow-y-scroll scrollbar-thin scrollbar-thumb-scrollbar">
					{lines.map(line => (
						<code
							key={line.timestamp}
							data-type={line.type}
							dangerouslySetInnerHTML={{
								__html: line.html,
							}}
						/>
					))}
				</pre>
			</div>
		</div>
	)
}

export function TestRunner({
	name,
	onRun,
}: {
	name: string
	onRun?: () => void
}) {
	const fetcher = useFetcher<typeof action>()
	const latestOnRun = useRef(onRun)
	useEffect(() => {
		latestOnRun.current = onRun
	}, [onRun])
	useEffect(() => {
		if (fetcher.data?.success) {
			latestOnRun.current?.()
		}
	}, [fetcher.data])
	return (
		<fetcher.Form method="POST" action="/test" className="h-full">
			<input type="hidden" name="name" value={name} />
			<SimpleTooltip
				content={fetcher.state === 'idle' ? 'Run Tests' : 'Running Tests...'}
			>
				<button
					type="submit"
					name="intent"
					value="run"
					className="flex h-full flex-grow items-center justify-center border-r px-3.5"
				>
					{fetcher.state === 'idle' ? (
						<Icon name="TriangleSmall" />
					) : (
						<AnimatedBars role="status" />
					)}
				</button>
			</SimpleTooltip>
		</fetcher.Form>
	)
}

export function ClearTest({
	name,
	onClear,
}: {
	name: string
	onClear?: () => void
}) {
	const fetcher = useFetcher<typeof action>()
	const latestOnClear = useRef(onClear)
	useEffect(() => {
		latestOnClear.current = onClear
	}, [onClear])
	useEffect(() => {
		if (fetcher.data?.success) {
			latestOnClear.current?.()
		}
	}, [fetcher.data])
	return (
		<fetcher.Form method="POST" action="/test" className="h-full">
			<input type="hidden" name="name" value={name} />
			<SimpleTooltip
				content={fetcher.state === 'idle' ? 'Clear Tests' : 'Clearing Tests...'}
			>
				<button
					type="submit"
					name="intent"
					value="clear"
					className="flex h-full flex-grow items-center justify-center border-l px-3.5"
				>
					{fetcher.state === 'idle' ? (
						<Icon name="Clear" />
					) : (
						<Icon name="Clear" className="animate-pulse" role="status" />
					)}
				</button>
			</SimpleTooltip>
		</fetcher.Form>
	)
}

export function StopTest({
	name,
	onStop,
}: {
	name: string
	onStop?: () => void
}) {
	const fetcher = useFetcher<typeof action>()
	const latestOnStop = useRef(onStop)
	useEffect(() => {
		latestOnStop.current = onStop
	}, [onStop])
	useEffect(() => {
		if (fetcher.data?.success) {
			latestOnStop.current?.()
		}
	}, [fetcher.data])
	return (
		<fetcher.Form method="POST" action="/test" className="h-full">
			<input type="hidden" name="name" value={name} />
			<SimpleTooltip
				content={fetcher.state === 'idle' ? 'Stop Tests' : 'Stopping Tests...'}
			>
				<button
					type="submit"
					name="intent"
					value="stop"
					className="flex h-full flex-grow items-center justify-center border-r px-3.5"
				>
					{fetcher.state === 'idle' ? (
						<Icon name="Stop" />
					) : (
						<Icon name="Stop" className="animate-pulse" role="status" />
					)}
				</button>
			</SimpleTooltip>
		</fetcher.Form>
	)
}
