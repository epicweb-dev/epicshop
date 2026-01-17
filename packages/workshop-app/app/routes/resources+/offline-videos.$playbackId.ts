import { invariantResponse } from '@epic-web/invariant'
import { getOfflineVideoAsset } from '@epic-web/workshop-utils/offline-videos.server'
import { createReadableStreamFromReadable } from '@react-router/node'
import { type LoaderFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

function parseRange(rangeHeader: string, size: number) {
	const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader)
	if (!match) return null
	const start = Number(match[1])
	const end = match[2] ? Number(match[2]) : size - 1
	if (Number.isNaN(start) || Number.isNaN(end)) return null
	if (start > end || end >= size) return null
	return { start, end }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	ensureUndeployed()
	const playbackId = params.playbackId
	invariantResponse(playbackId, 'Playback ID is required', { status: 400 })

	const asset = await getOfflineVideoAsset(playbackId)
	if (!asset) {
		throw new Response('Offline video not found', { status: 404 })
	}

	const rangeHeader = request.headers.get('Range')
	const headers = new Headers({
		'Accept-Ranges': 'bytes',
		'Content-Type': asset.contentType,
	})

	if (!rangeHeader) {
		headers.set('Content-Length', asset.size.toString())
		if (request.method === 'HEAD') {
			return new Response(null, { status: 200, headers })
		}
		const stream = asset.createStream()
		return new Response(createReadableStreamFromReadable(stream), {
			status: 200,
			headers,
		})
	}

	const range = parseRange(rangeHeader, asset.size)
	if (!range) {
		headers.set('Content-Range', `bytes */${asset.size}`)
		return new Response('Invalid range', { status: 416, headers })
	}

	headers.set(
		'Content-Range',
		`bytes ${range.start}-${range.end}/${asset.size}`,
	)
	headers.set('Content-Length', `${range.end - range.start + 1}`)

	if (request.method === 'HEAD') {
		return new Response(null, { status: 206, headers })
	}

	const stream = asset.createStream(range)
	return new Response(createReadableStreamFromReadable(stream), {
		status: 206,
		headers,
	})
}
