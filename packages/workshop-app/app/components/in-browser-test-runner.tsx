import * as Accordion from '@radix-ui/react-accordion'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { AnimatedBars, Icon } from './icons.tsx'
import AccordionComponent from '#app/components/accordion.tsx'

const testRunnerStatusDataSchema = z.intersection(
	z.object({
		type: z.literal('kcdshop:test-status-update'),
		timestamp: z.number(),
	}),
	z.union([
		z.object({ status: z.literal('pending') }),
		z.object({ status: z.literal('pass') }),
		z.object({ status: z.literal('fail'), error: z.string() }),
	]),
)

const testRunnerTestStepDataSchema = z.object({
	type: z.literal('kcdshop:test-step-update'),
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
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [message, setMessage] = useState<TestRunnerStatusData | null>(null)
	const [testSteps, setTestSteps] = useState<Array<TestRunnerTestStepData>>([])

	useEffect(() => {
		function handleMessage(messageEvent: MessageEvent) {
			if (messageEvent.source !== iframeRef.current?.contentWindow) return
			if ('request' in messageEvent.data) return

			const result = testRunnerDataSchema.safeParse(messageEvent.data, {
				path: ['messageEvent', 'data'],
			})
			if (!result.success) {
				console.error(
					`Invalid message from test iframe`,
					messageEvent.data,
					result.error,
				)
				return
			}
			const { data } = result
			if (data.type === 'kcdshop:test-status-update') {
				if (data.status === 'pending') {
					setTestSteps([])
				}
				setMessage(data)
			}
			if (data.type === 'kcdshop:test-step-update') {
				setTestSteps(steps => [...steps, data])
			}
		}
		window.addEventListener('message', handleMessage)
		return () => {
			window.removeEventListener('message', handleMessage)
		}
	}, [])

	const statusEmoji = {
		pending: <AnimatedBars aria-label="Pending" />,
		pass: (
			<Icon
				name="CheckSmall"
				aria-label="Passed"
				className="text-emerald-700"
			/>
		),
		fail: (
			<Icon
				name="Remove"
				aria-label="Failed"
				className="text-foreground-danger"
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
						<div className="p-5 pt-3">
							<ul className="">
								{sortedTestSteps.map(testStep => (
									// sometimes the steps come in so fast that the timestamp is the same
									<li key={testStep.timestamp + testStep.title}>
										<div className="flex items-baseline gap-2 text-emerald-700">
											<span>{testStepStatusEmojis[testStep.status]}</span>
											<pre className="whitespace-pre-wrap">
												{testStep.title}
											</pre>
										</div>
									</li>
								))}
							</ul>
							{message?.status === 'fail' ? (
								<div className="flex items-baseline gap-2 text-foreground-danger">
									<span>{testStepStatusEmojis.fail}</span>
									<pre className="max-h-48 overflow-y-auto text-foreground-danger scrollbar-thin scrollbar-thumb-scrollbar">
										{message.error}
									</pre>
								</div>
							) : null}
							<iframe
								ref={iframeRef}
								title={testFile}
								src={pathname + testFile}
								className="mt-5 min-h-[420px] w-full border bg-white"
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
