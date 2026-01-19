import * as Accordion from '@radix-ui/react-accordion'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import AccordionComponent from '#app/components/accordion.tsx'
import { useTheme } from '#app/routes/theme/index.tsx'
import { stripCursorMovements, useAnsiToHtml } from '#app/utils/ansi-text.ts'
import { AnimatedBars, Icon } from './icons.tsx'

const testRunnerStatusDataSchema = z.intersection(
	z.object({
		type: z.literal('epicshop:test-status-update'),
		timestamp: z.number(),
	}),
	z.union([
		z.object({ status: z.literal('pending') }),
		z.object({ status: z.literal('pass') }),
		z.object({ status: z.literal('fail'), error: z.string() }),
	]),
)

const testRunnerTestStepDataSchema = z.object({
	type: z.literal('epicshop:test-step-update'),
	status: z.literal('pass'),
	title: z.string(),
	timestamp: z.number(),
})

const testRunnerDataSchema = z.union([
	testRunnerTestStepDataSchema,
	testRunnerStatusDataSchema,
])

type TestRunnerStatusData = z.infer<typeof testRunnerStatusDataSchema>
type TestRunnerTestStepData = z.infer<typeof testRunnerTestStepDataSchema>

export function InBrowserTestRunner({
	pathname,
	testFile,
}: {
	pathname: string
	testFile: string
}) {
	const theme = useTheme()
	const ansi = useAnsiToHtml()
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [message, setMessage] = useState<TestRunnerStatusData | null>(null)
	const [testSteps, setTestSteps] = useState<Array<TestRunnerTestStepData>>([])

	useEffect(() => {
		function handleMessage(messageEvent: MessageEvent) {
			if (messageEvent.source !== iframeRef.current?.contentWindow) return
			if ('request' in messageEvent.data) return

			const result = testRunnerDataSchema.safeParse(messageEvent.data)
			if (!result.success) {
				console.error(
					`Invalid message from test iframe`,
					messageEvent.data,
					result.error,
				)
				return
			}
			const { data } = result
			if (data.type === 'epicshop:test-status-update') {
				if (data.status === 'pending') {
					setTestSteps([])
				}
				setMessage(data)
			}
			if (data.type === 'epicshop:test-step-update') {
				setTestSteps((steps) => [...steps, data])
			}
		}
		window.addEventListener('message', handleMessage)
		return () => {
			window.removeEventListener('message', handleMessage)
		}
	}, [])

	const statusEmoji = {
		pending: <AnimatedBars size={14} aria-label="Pending" />,
		pass: (
			<Icon name="CheckSmall" aria-label="Passed" className="text-success" />
		),
		fail: (
			<Icon
				name="Remove"
				aria-label="Failed"
				className="text-foreground-destructive"
			/>
		),
		unknown: (
			<Icon name="Question" aria-label="Unknown" className="animate-pulse" />
		),
	}[message?.status ?? 'unknown']

	const sortedTestSteps = testSteps.sort((a, b) => a.timestamp - b.timestamp)
	const testStepStatusEmojis = {
		pass: <Icon name="CheckSmall" aria-label="Passed" />,
		fail: <Icon name="Remove" aria-label="Failed" />,
		unknown: (
			<Icon name="Question" aria-label="Unknown" className="animate-pulse" />
		),
	}

	return (
		<>
			<Accordion.Root className="w-full" type="multiple">
				<AccordionComponent
					icon={statusEmoji}
					title={testFile}
					forceMount={true}
				>
					<div className="not-prose">
						<div className="flex flex-col gap-2 p-5 pt-3">
							<ul className="flex flex-col gap-2">
								{sortedTestSteps.map((testStep, index) => (
									// sometimes the steps come in so fast that the timestamp is the same
									<li key={testStep.timestamp + testStep.title}>
										<div className="text-success flex items-baseline gap-2">
											<span>{index + 1}.</span>
											<span>{testStepStatusEmojis[testStep.status]}</span>
											<pre className="scrollbar-thin scrollbar-thumb-scrollbar max-h-48 overflow-y-auto p-4">
												{testStep.title}
											</pre>
										</div>
									</li>
								))}
							</ul>
							{message?.status === 'fail' ? (
								<div className="text-foreground-destructive flex items-baseline gap-2">
									<span>{sortedTestSteps.length + 1}.</span>
									<span>{testStepStatusEmojis.fail}</span>
									<pre
										className="scrollbar-thin scrollbar-thumb-scrollbar max-h-48 overflow-y-auto p-4"
										dangerouslySetInnerHTML={{
											__html: ansi.toHtml(stripCursorMovements(message.error)),
										}}
									/>
								</div>
							) : null}
							<iframe
								ref={iframeRef}
								title={testFile}
								src={pathname + testFile}
								className="bg-background mt-5 min-h-[420px] w-full border"
								style={{ colorScheme: theme }}
								allow="clipboard-write"
							/>
						</div>
						<div className="flex border-y">
							<button
								onClick={() =>
									iframeRef.current?.contentWindow?.location.reload()
								}
								className="border-r p-3"
							>
								<Icon name="Refresh" aria-label="Rerun Tests" />
							</button>
							<a
								href={pathname + testFile}
								target="_blank"
								rel="noreferrer"
								className="border-r p-3"
							>
								<Icon name="ExternalLink" aria-label="Open in New Window" />
							</a>
						</div>
					</div>
				</AccordionComponent>
			</Accordion.Root>
		</>
	)
}
