import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router'
import {
	DeferredEpicVideo,
	EpicVideoInfoProvider,
} from '#app/components/epic-video.tsx'

vi.mock('@mux/mux-player-react', async () => {
	const React = await import('react')
	const MockMuxPlayer = React.forwardRef<
		HTMLVideoElement,
		React.ComponentProps<'video'>
	>((props, ref) => <video ref={ref} data-testid="mux-player" {...props} />)
	return {
		__esModule: true,
		default: MockMuxPlayer,
		MinResolution: {
			noLessThan480p: 'noLessThan480p',
			noLessThan540p: 'noLessThan540p',
			noLessThan720p: 'noLessThan720p',
			noLessThan1080p: 'noLessThan1080p',
			noLessThan1440p: 'noLessThan1440p',
			noLessThan2160p: 'noLessThan2160p',
		},
		MaxResolution: {
			upTo720p: 'upTo720p',
			upTo1080p: 'upTo1080p',
			upTo1440p: 'upTo1440p',
			upTo2160p: 'upTo2160p',
		},
	}
})

declare global {
	var ENV: { EPICSHOP_DEPLOYED: boolean; EPICSHOP_GITHUB_REPO: string }
}

globalThis.ENV = {
	EPICSHOP_DEPLOYED: false,
	EPICSHOP_GITHUB_REPO: 'https://github.com/epicweb-dev/epicshop',
}

const videoUrl = 'https://epicweb.dev/test/video'
const videoTitle = 'Test Video'
const muxPlaybackId = 'mux-playback-id'

const epicVideoInfo = {
	status: 'success',
	muxPlaybackId,
	transcript: '',
	duration: 123,
	durationEstimate: null,
	downloadsAvailable: false,
	downloadSizes: [],
} as const

type RootData = {
	preferences: {
		offlineVideo?: { downloadResolution?: string }
		player?: { playbackRate?: number; volumeRate?: number }
	}
	offlineVideoPlaybackIds: Array<string>
	workshopConfig: { product: { host: string; displayName: string } }
	requestInfo: {
		session: { theme: 'light' | 'dark' | 'system' }
		hints: { theme: string; timeZone: string; reducedMotion: string }
		online: boolean
		protocol: string
		hostname: string
		port: string
		origin: string
		domain: string
		path: string
		separator: string
	}
	user: null
	userHasAccess: boolean
}

const baseRootData: RootData = {
	preferences: {
		offlineVideo: { downloadResolution: 'best' },
	},
	offlineVideoPlaybackIds: [],
	workshopConfig: { product: { host: 'epicweb.dev', displayName: 'Epic Web' } },
	requestInfo: {
		session: { theme: 'light' },
		hints: { theme: 'light', timeZone: 'UTC', reducedMotion: 'no-preference' },
		online: true,
		protocol: 'https:',
		hostname: 'example.com',
		port: '',
		origin: 'https://example.com',
		domain: 'https://example.com',
		path: '/',
		separator: '/',
	},
	user: null,
	userHasAccess: true,
}

function createRootData(overrides?: Partial<RootData>) {
	return { ...baseRootData, ...overrides }
}

function setupRouter(rootDataRef: { current: RootData }) {
	const epicVideoInfosPromise = Promise.resolve({ [videoUrl]: epicVideoInfo })
	return createMemoryRouter(
		[
			{
				id: 'root',
				path: '/',
				loader: () => rootDataRef.current,
				element: <Outlet />,
				children: [
					{
						index: true,
						element: (
							<EpicVideoInfoProvider
								epicVideoInfosPromise={epicVideoInfosPromise}
							>
								<DeferredEpicVideo url={videoUrl} title={videoTitle} />
							</EpicVideoInfoProvider>
						),
					},
				],
			},
		],
		{ initialEntries: ['/'] },
	)
}

function markPlaying(player: HTMLVideoElement) {
	Object.defineProperty(player, 'paused', {
		get: () => !player.isConnected,
		configurable: true,
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

test('autoplays the offline player when switching from a playing online video (aha)', async () => {
	const rootDataRef = { current: createRootData() }
	const router = setupRouter(rootDataRef)

	await render(<RouterProvider router={router} />)
	await new Promise((resolve) => setTimeout(resolve, 0))

	const muxPlayer = document.querySelector(
		'[data-testid="mux-player"]',
	) as HTMLVideoElement | null
	expect(muxPlayer).not.toBeNull()
	if (!muxPlayer) return
	markPlaying(muxPlayer)

	const playSpy = vi
		.spyOn(HTMLMediaElement.prototype, 'play')
		.mockResolvedValue(undefined)

	rootDataRef.current = {
		...rootDataRef.current,
		offlineVideoPlaybackIds: [muxPlaybackId],
	}
	router.revalidate()

	await expect
		.element(page.getByRole('button', { name: 'Delete offline video' }))
		.toBeVisible()

	const offlineVideo = document.querySelector(
		`video[aria-label="${videoTitle}"]`,
	) as HTMLVideoElement | null
	expect(offlineVideo).not.toBeNull()
	offlineVideo?.dispatchEvent(new Event('loadedmetadata'))

	await new Promise((resolve) => setTimeout(resolve, 0))

	expect(playSpy).toHaveBeenCalledTimes(1)
})

test('swallows autoplay rejections when switching players (aha)', async () => {
	const rootDataRef = { current: createRootData() }
	const router = setupRouter(rootDataRef)

	await render(<RouterProvider router={router} />)
	await new Promise((resolve) => setTimeout(resolve, 0))

	const muxPlayer = document.querySelector(
		'[data-testid="mux-player"]',
	) as HTMLVideoElement | null
	expect(muxPlayer).not.toBeNull()
	if (!muxPlayer) return
	markPlaying(muxPlayer)

	const unhandled: Array<PromiseRejectionEvent> = []
	const handleUnhandled = (event: PromiseRejectionEvent) => {
		unhandled.push(event)
		event.preventDefault()
	}
	window.addEventListener('unhandledrejection', handleUnhandled)

	try {
		const playSpy = vi
			.spyOn(HTMLMediaElement.prototype, 'play')
			.mockImplementation(() => Promise.reject(new Error('blocked')))

		rootDataRef.current = {
			...rootDataRef.current,
			offlineVideoPlaybackIds: [muxPlaybackId],
		}
		router.revalidate()

		await expect
			.element(page.getByRole('button', { name: 'Delete offline video' }))
			.toBeVisible()

		const offlineVideo = document.querySelector(
			`video[aria-label="${videoTitle}"]`,
		) as HTMLVideoElement | null
		expect(offlineVideo).not.toBeNull()
		offlineVideo?.dispatchEvent(new Event('loadedmetadata'))

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(playSpy).toHaveBeenCalledTimes(1)
		expect(unhandled).toHaveLength(0)
	} finally {
		window.removeEventListener('unhandledrejection', handleUnhandled)
	}
})
