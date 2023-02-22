import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

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
	baseUrl,
	testFile,
}: {
	baseUrl: string
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
		pending: '⏳',
		pass: '✅',
		fail: '❌',
		unknown: '🧐',
	}[message?.status ?? 'unknown']

	const sortedTestSteps = testSteps.sort((a, b) => a.timestamp - b.timestamp)
	const testStepStatusEmojis = {
		pass: '✅',
		fail: '❌',
		unknown: '🧐',
	}

	return (
		<details>
			<summary>
				{statusEmoji}. {testFile}
			</summary>

			<button
				onClick={() => iframeRef.current?.contentWindow?.location.reload()}
			>
				Rerun
			</button>

			<ul className="list-decimal px-5">
				{sortedTestSteps.map(testStep => (
					// sometimes the steps come in so fast that the timestamp is the same
					<li key={testStep.timestamp + testStep.title}>
						<pre className="whitespace-pre-wrap text-green-700">
							{testStepStatusEmojis[testStep.status]} {testStep.title}
						</pre>
					</li>
				))}
			</ul>

			{message?.status === 'fail' ? (
				<pre className="max-h-48 whitespace-pre-wrap text-red-700">
					{message.error}
				</pre>
			) : null}

			<iframe
				ref={iframeRef}
				title={testFile}
				src={baseUrl + testFile}
				className="min-h-[420px] w-full border-2 border-stone-400"
			/>
		</details>
	)
}
