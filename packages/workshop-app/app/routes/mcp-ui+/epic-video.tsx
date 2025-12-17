import { invariantResponse } from '@epic-web/invariant'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { useEffect, useRef } from 'react'
import { data } from 'react-router'
import {
	DeferredEpicVideo,
	EpicVideoInfoProvider,
} from '#app/components/epic-video.tsx'
import { type Route } from './+types/epic-video.tsx'
import { sendMcpMessage } from './__utils.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('epicVideoLoader')
	const videoUrl = new URL(request.url).searchParams.get('url')
	invariantResponse(videoUrl, 'url param is required')
	const videoInfos = getEpicVideoInfos([videoUrl], {
		request,
		timings,
	})
	return data(
		{ videoInfos, videoUrl },
		{
			headers: {
				'Server-Timing': timings.toString(),
			},
		},
	)
}

export default function EpicVideoEmbedRoute({
	loaderData,
}: Route.ComponentProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		void loaderData.videoInfos?.finally(() => {
			window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')
			if (!rootRef.current) return

			const height = rootRef.current.clientHeight
			const width = rootRef.current.clientWidth

			window.parent.postMessage(
				{ type: 'ui-size-change', payload: { height, width } },
				'*',
			)
		})
	}, [loaderData.videoInfos])

	async function handleLinksClick(event: React.MouseEvent<HTMLElement>) {
		const target = event.target
		if (!(target instanceof HTMLAnchorElement)) return

		const href = target.href
		if (!href) return

		event.preventDefault()
		event.stopPropagation()

		const url = href.startsWith('http')
			? new URL(href)
			: new URL(href, window.location.origin)
		const isLocal = url.host === window.location.host

		if (isLocal && url.pathname === '/login') {
			await sendMcpMessage('tool', {
				toolName: 'login',
				params: { workshopDirectory: ENV.EPICSHOP_CONTEXT_CWD },
			})
		}

		await sendMcpMessage('link', { url: url.toString() })
	}

	return (
		<div ref={rootRef} onClickCapture={handleLinksClick}>
			<EpicVideoInfoProvider epicVideoInfosPromise={loaderData.videoInfos}>
				<DeferredEpicVideo url={loaderData.videoUrl} />
			</EpicVideoInfoProvider>
		</div>
	)
}
