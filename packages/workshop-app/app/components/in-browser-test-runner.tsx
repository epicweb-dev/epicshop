import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { getErrorMessage } from '~/utils/misc'

const testRunnerStatusDataSchema = z.intersection(
	z.object({
		type: z.literal('kcdshop:test-status-update'),
		timestamp: z.number(),
	}),
	z.union([
		z.object({ status: z.literal('pending') }),
		z.object({ status: z.literal('pass') }),
		z.object({ status: z.literal('fail'), error: z.unknown() }),
	]),
)

const testRunnerAlfredDataSchema = z.object({
	type: z.literal('kcdshop:test-alfred-update'),
	status: z.literal('pass'),
	tip: z.string(),
	timestamp: z.number(),
})

const testRunnerDataSchema = z.union([
	testRunnerAlfredDataSchema,
	testRunnerStatusDataSchema,
])

type TestRunnerStatusData = z.infer<typeof testRunnerStatusDataSchema>
type TestRunnerAlfredData = z.infer<typeof testRunnerAlfredDataSchema>

export function InBrowserTestRunner({
	baseUrl,
	testFile,
}: {
	baseUrl: string
	testFile: string
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [message, setMessage] = useState<TestRunnerStatusData | null>(null)
	const [alfredTips, setAlfredTips] = useState<Array<TestRunnerAlfredData>>([])

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
					setAlfredTips([])
				}
				setMessage(data)
			}
			if (data.type === 'kcdshop:test-alfred-update') {
				setAlfredTips(tips => [...tips, data])
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

	const sortedAlfredTips = alfredTips.sort((a, b) => a.timestamp - b.timestamp)
	const alfredStatusEmojis = {
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

			<ul className="list-decimal">
				{sortedAlfredTips.map(alfredTip => (
					// sometimes the tips come in so fast that the timestamp is the same
					<li key={alfredTip.timestamp + alfredTip.tip}>
						<pre>
							{alfredStatusEmojis[alfredTip.status]} {alfredTip.tip}
						</pre>
					</li>
				))}
			</ul>

			{message?.status === 'fail' ? (
				<pre className="prose max-h-32 overflow-scroll text-red-700">
					{getErrorMessage(message.error)}
				</pre>
			) : null}

			<iframe
				ref={iframeRef}
				title={testFile}
				src={baseUrl + testFile}
				className="h-full w-full border-2 border-stone-400"
			/>
		</details>
	)
}
