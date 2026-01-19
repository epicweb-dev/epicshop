'use client'

import { useEffect, useReducer, useRef } from 'react'
import { useFetcher, useRevalidator } from 'react-router'
import { useEventSource } from 'remix-utils/sse/react'
import { AnimatedBars, Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { stripCursorMovements, useAnsiToHtml } from '#app/utils/ansi-text.ts'
import { usePERedirectInput } from '#app/utils/pe.client.tsx'
import { testEventQueueSchema } from './test-event-schema.ts'

type TestActionData = { success: boolean; error?: unknown }

function simpleReducer<State>(prev: State, getNext: (prev: State) => State) {
	return getNext(prev)
}

export function TestOutput({ name }: { name: string }) {
	type State = {
		/** version is used to trigger an unsubscribe and resubscribe to the event source */
		version: number
		isRunning: boolean
		exitCode: number | null | undefined
		lines: Array<{
			type: 'stdout' | 'stderr'
			content: string
			timestamp: number
		}>
	}
	const [state, dispatch] = useReducer(simpleReducer<State>, {
		version: 0,
		isRunning: false,
		exitCode: undefined,
		lines: [],
	})
	const revalidator = useRevalidator()
	const latestRevalidatorRef = useRef(revalidator)
	useEffect(() => {
		latestRevalidatorRef.current = revalidator
	}, [revalidator])
	const ansi = useAnsiToHtml()
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
					dispatch((prev) => ({ ...prev, isRunning, exitCode }))
					void latestRevalidatorRef.current.revalidate()
					break
				}
				case 'init': {
					const { output, exitCode, isRunning } = event
					dispatch((prev) => ({ ...prev, lines: output, exitCode, isRunning }))
					break
				}
				case 'stderr':
				case 'stdout': {
					const { type, data: content, timestamp } = event
					dispatch((prev) => ({
						...prev,
						lines: [...prev.lines, { type, content, timestamp }].sort(
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
		<div className="relative flex h-full w-full flex-col overflow-hidden">
			<div className="flex h-12 w-full shrink-0 items-center justify-between border-b">
				<div className="flex h-full items-center">
					{!isRunning && (
						<TestRunner
							name={name}
							onRun={() => {
								dispatch((prev) => ({
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
							<div className="flex h-full grow items-center justify-center border-r px-3.5">
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
							dispatch((prev) => ({
								...prev,
								exitCode: undefined,
								lines: [],
							}))
						}}
					/>
				)}
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-5 p-5">
				<p className="font-mono text-sm font-medium uppercase">Test Output</p>
				<pre className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar min-h-0 flex-1 overflow-y-auto">
					{lines.map((line) => (
						<code
							key={line.timestamp}
							data-type={line.type}
							dangerouslySetInnerHTML={{
								__html: ansi.toHtml(stripCursorMovements(line.content)),
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
	const fetcher = useFetcher<TestActionData>()
	const peRedirectInput = usePERedirectInput()
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
			{peRedirectInput}
			<input type="hidden" name="name" value={name} />
			<SimpleTooltip
				content={fetcher.state === 'idle' ? 'Run Tests' : 'Running Tests...'}
			>
				<button
					type="submit"
					name="intent"
					value="run"
					className="flex h-full grow items-center justify-center border-r px-3.5"
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
	const fetcher = useFetcher<TestActionData>()
	const peRedirectInput = usePERedirectInput()
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
			{peRedirectInput}
			<input type="hidden" name="name" value={name} />
			<SimpleTooltip
				content={fetcher.state === 'idle' ? 'Clear Tests' : 'Clearing Tests...'}
			>
				<button
					type="submit"
					name="intent"
					value="clear"
					className="flex h-full grow items-center justify-center border-l px-3.5"
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
	const fetcher = useFetcher<TestActionData>()
	const peRedirectInput = usePERedirectInput()
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
			{peRedirectInput}
			<input type="hidden" name="name" value={name} />
			<SimpleTooltip
				content={fetcher.state === 'idle' ? 'Stop Tests' : 'Stopping Tests...'}
			>
				<button
					type="submit"
					name="intent"
					value="stop"
					className="flex h-full grow items-center justify-center border-r px-3.5"
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
