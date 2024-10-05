import { useRevalidator } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { useRequestInfo } from '#app/utils/request-info.js'

const eventSchema = z.object({
	type: z.literal('epicshop:file-change'),
	data: z.object({
		filePaths: z.array(z.string()),
	}),
})

function useRevalidationWSImpl({ watchPaths }: { watchPaths: Array<string> }) {
	const requestInfo = useRequestInfo()

	const revalidator = useRevalidator()
	const latestRevalidatorRef = useRef(revalidator)
	useEffect(() => {
		latestRevalidatorRef.current = revalidator
	}, [revalidator])

	const socketParams = new URLSearchParams()
	for (const path of watchPaths) {
		socketParams.append('watch', path)
	}
	const protocol = requestInfo.protocol === 'https:' ? 'wss:' : 'ws:'
	const host = requestInfo.hostname
	const port = requestInfo.port
	const socketPath = `${protocol}//${host}:${port}/__ws?${socketParams.toString()}`

	useEffect(() => {
		let ws: WebSocket | null = null
		function createWebSocket() {
			if (ws) ws.close()

			ws = new WebSocket(socketPath)

			ws.onmessage = (message) => {
				const eventParsed = eventSchema.safeParse(JSON.parse(message.data))
				if (!eventParsed.success) return
				const { data: event } = eventParsed
				if (event.type !== 'epicshop:file-change') return
				console.log(
					'🐨 Revalidating due to file changes:',
					event.data.filePaths,
				)
				latestRevalidatorRef.current.revalidate()
			}

			ws.onclose = (event) => {
				if (event.code === 1006) {
					setTimeout(() => {
						createWebSocket()
					}, 1000)
				}
			}

			ws.onerror = (error) => {
				console.error('🐨 EpicShop WebSocket error:', error)
			}
		}

		createWebSocket()

		// Cleanup function to close the WebSocket when the component unmounts
		return () => {
			ws?.close()
		}
	}, [socketPath])

	// This component doesn't render anything
	return null
}

export const useRevalidationWS = ENV.EPICSHOP_DEPLOYED
	? () => null
	: useRevalidationWSImpl
