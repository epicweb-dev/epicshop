import { type EpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	type OfflineVideoDownloadResolution,
	getPreferredDownloadSize,
} from '@epic-web/workshop-utils/offline-video-utils'
import { type MuxPlayerRefAttributes } from '@mux/mux-player-react'
import {
	MediaControlBar,
	MediaController,
	MediaFullscreenButton,
	MediaMuteButton,
	MediaPipButton,
	MediaPlayButton,
	MediaPlaybackRateButton,
	MediaSeekBackwardButton,
	MediaSeekForwardButton,
	MediaTimeDisplay,
	MediaTimeRange,
	MediaVolumeRange,
} from 'media-chrome/react'
import * as React from 'react'
import { Await, Link, useFetcher, useRevalidator } from 'react-router'
import { useEventSource } from 'remix-utils/sse/react'
import { toast } from 'sonner'
import { useTheme } from '#app/routes/theme/index.tsx'
import {
	MuxPlayer,
	usePlayerPreferences,
} from '#app/routes/video-player/index.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useIsOnline } from '#app/utils/online.ts'
import { useRootLoaderData } from '#app/utils/root-loader.ts'
import { Icon } from './icons.tsx'
import { Loading } from './loading.tsx'
import { OfflineVideoActionButtons } from './offline-video-actions.tsx'
import { useOptionalUser } from './user.tsx'
import { useWorkshopConfig } from './workshop-config.tsx'

const EpicVideoInfoContext = React.createContext<
	Promise<EpicVideoInfos> | null | undefined
>(null)

type OfflineVideoDownloadSize = {
	quality: string
	size: number | null
}

const offlineVideoResolutionLabels: Record<
	OfflineVideoDownloadResolution,
	string
> = {
	best: 'best available',
	high: 'high',
	medium: 'medium',
	low: 'low',
}

function getOfflineVideoResolutionLabel(value: unknown) {
	if (value === 'high' || value === 'medium' || value === 'low') {
		return offlineVideoResolutionLabels[value]
	}
	return offlineVideoResolutionLabels.best
}

function getOfflineVideoResolution(
	value: unknown,
): OfflineVideoDownloadResolution {
	if (value === 'high' || value === 'medium' || value === 'low') return value
	return 'best'
}

type OfflineVideoActionData = {
	status: string
	action?: string
	message?: string
}

function OfflineVideoUnavailable() {
	return (
		<div className="relative aspect-video w-full shrink-0 shadow-lg">
			<div className="text-foreground-destructive absolute inset-0 z-10 flex items-center justify-center p-8">
				<Icon name="WifiNoConnection" size="xl">
					<span>
						Offline video not available. Download offline videos in{' '}
						<Link to="/preferences" className="underline">
							Preferences
						</Link>
						.
					</span>
				</Icon>
			</div>
		</div>
	)
}

export function EpicVideoInfoProvider({
	children,
	epicVideoInfosPromise,
}: {
	children: React.ReactNode
	epicVideoInfosPromise?: Promise<EpicVideoInfos> | null
}) {
	return (
		<EpicVideoInfoContext.Provider value={epicVideoInfosPromise}>
			{children}
		</EpicVideoInfoContext.Provider>
	)
}

function extractEpicTitle(urlString: string) {
	let url: URL = new URL('https://epicweb.dev')
	try {
		url = new URL(urlString)
	} catch (error) {
		console.error(error)
		return 'Epic Video'
	}
	const urlSegments = url.pathname.split('/').filter(Boolean)
	const isSolution = urlSegments.includes('solution')
	let titleSegment = urlSegments.pop()
	const nonTitles = ['problem', 'solution', 'embed', 'exercise']
	const isTitleSegment = (str?: string) => str && !nonTitles.includes(str)
	while (!isTitleSegment(titleSegment)) titleSegment = urlSegments.pop()

	if (!titleSegment) return 'Epic Video'

	// Chop off anything after ~ if no spaces follow anywhere after the ~
	// that's common for EpicAI videos
	titleSegment = titleSegment.replace(/~[^ ]*$/, '')

	const titleWords = titleSegment.split('-')
	// prettier-ignore
	const lowerCaseWords = [
		'the', 'a', 'an', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
		'from', 'by', 'of', 'in', 'with', 'as', 'npm', 'git', 'ssh', 'cli'
	]
	// prettier-ignore
	const literalWords = [
		'OAuth', 'UI', 'UX', 'API', 'CSS', 'HTML', 'JS', 'TS', 'SVG', 'AI', 'CSRF',
		'CORS', 'HTTP', 'HTTPS', 'URL', 'URI', 'DB', 'SQL', 'JSON', 'YAML', 'YML',

		'useActionData', 'useAsyncError', 'useAsyncValue', 'useBeforeUnload',
		'useFetcher', 'useFetchers', 'useFormAction', 'useHref', 'useLoaderData',
		'useLocation', 'useMatches', 'useNavigate', 'useNavigation',
		'useNavigationType', 'useOutlet', 'useOutletContext', 'useParams',
		'useResolvedPath', 'useRevalidator', 'useRouteError', 'useRouteLoaderData',
		'useSearchParams', 'useSubmit', 'useCallback', 'useContext',
		'useDebugValue', 'useDeferredValue', 'useEffect', 'useId',
		'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect', 'useMemo',
		'useReducer', 'useRef', 'useState', 'useSyncExternalStore', 'useTransition',
		'useForm','useFieldset', 'useFieldList', 'useEventSource', 'useHydrated',
		'useAuthenticityToken', 'useShouldHydrate', 'useGlobalNavigationState',
		'useLocales', 'useDelegatedAnchors', 'useDebounceFetcher', 'useFetcherType',
	]
	const title = titleWords
		.filter(Boolean)
		.map((word, index) => {
			const lowerWord = word.toLowerCase()
			const literalWord = literalWords.find(
				(w) => w.toLowerCase() === lowerWord,
			)
			if (literalWord) return literalWord
			if (lowerCaseWords.includes(lowerWord) && index > 0) {
				return lowerWord
			}
			return lowerWord[0]?.toUpperCase() + lowerWord.slice(1)
		})
		.join(' ')
	if (isSolution) {
		return `${title} (🏁 solution)`
	}
	return title
}

export function VideoEmbed({
	url,
	title = 'Video Embed',
	loadingContent = (
		<Loading>
			<span>Loading "{title}"</span>
		</Loading>
	),
}: {
	url: string
	title?: string
	loadingContent?: React.ReactNode
}) {
	const theme = useTheme()
	const [iframeLoaded, setIframeLoaded] = React.useState(false)
	const isOnline = useIsOnline()
	if (!isOnline) {
		return (
			<div className="not-prose relative aspect-video w-full shrink-0 shadow-lg">
				<div className="text-foreground-destructive absolute inset-0 z-10 flex items-center justify-center p-8">
					<Icon name="WifiNoConnection" size="xl">
						<span>
							{'Unable to load the video '}
							<a href={url} className="underline">
								{`"${title ?? url}"`}
							</a>
							{' when offline'}
						</span>
					</Icon>
				</div>
			</div>
		)
	}

	return (
		<div className="relative aspect-video w-full shrink-0 shadow-lg">
			{iframeLoaded ? null : (
				<div className="absolute inset-0 z-10 flex items-center justify-center p-8">
					{loadingContent}
				</div>
			)}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				// show what would have shown if there is an error
				onError={() => setIframeLoaded(true)}
				src={url}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
				title={title}
				sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
				allowFullScreen
				style={{ colorScheme: theme }}
			/>
		</div>
	)
}

function VideoLink({
	url,
	title,
	duration,
	durationEstimate,
	actions,
}: {
	url: string
	title: string
	duration?: number | null
	durationEstimate?: number | null
	actions?: React.ReactNode
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-base">
			{actions ? (
				<span className="flex items-center gap-1">{actions}</span>
			) : null}
			{duration ? (
				<span className="opacity-70">{formatDuration(duration)}</span>
			) : durationEstimate ? (
				<span className="opacity-70">~{formatDuration(durationEstimate)}</span>
			) : null}
			<a
				href={url}
				target="_blank"
				className="flex items-center gap-1 no-underline opacity-70 transition hover:underline hover:opacity-100"
				rel="noreferrer"
			>
				<Icon className="shrink-0" name="Video" size="lg" />
				{title} <span aria-hidden>↗︎</span>
			</a>
		</div>
	)
}
export function DeferredEpicVideo({
	url,
	title: providedTitle,
}: {
	url: string
	title?: string
}) {
	// we need to distinguish between the provided title and the fallback because the priority is:
	// 1. provided title
	// 2. title from the api
	// 3. fallback title
	const title = providedTitle ?? extractEpicTitle(url)
	const {
		product: { host, displayName },
	} = useWorkshopConfig()
	const user = useOptionalUser()
	const epicVideoInfosPromise = React.useContext(EpicVideoInfoContext)
	const linkUI = <VideoLink url={url} title={title} />
	return (
		<div className="not-prose">
			<React.Suspense
				fallback={
					<div>
						<div className="flex aspect-video w-full items-center justify-center">
							<Loading>{title}</Loading>
						</div>
						<div className="mt-4 flex flex-col gap-2">
							{linkUI}
							<div className="h-[32px]" />
						</div>
					</div>
				}
			>
				<Await
					errorElement={
						<div>Sorry, failed loading videos. Check the terminal output?</div>
					}
					resolve={epicVideoInfosPromise}
				>
					{(epicVideoInfos) => {
						const epicVideoInfo = epicVideoInfos?.[url]
						const transcriptUI = ENV.EPICSHOP_DEPLOYED ? (
							<div>
								<Link to={ENV.EPICSHOP_GITHUB_REPO} className="underline">
									Run locally
								</Link>
								{' for transcripts'}
							</div>
						) : (
							<div>
								<Link to="/login" className="underline">
									{user ? 'Upgrade' : 'Login'}
								</Link>
								{' for transcripts'}
							</div>
						)
						if (!epicVideoInfo) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										{transcriptUI}
									</div>
								</div>
							)
						}
						const info = epicVideoInfo
						if (info.status === 'success') {
							return (
								<EpicVideo
									url={url}
									title={providedTitle ?? info.title ?? title}
									muxPlaybackId={info.muxPlaybackId}
									transcript={info.transcript}
									duration={info.duration}
									durationEstimate={info.durationEstimate}
									downloadsAvailable={info.downloadsAvailable ?? false}
									downloadSizes={info.downloadSizes ?? []}
								/>
							)
						} else if (info.type === 'region-restricted') {
							return (
								<div>
									<div className="flex aspect-video min-h-full min-w-full flex-col items-center justify-start gap-2 overflow-y-scroll border-2 p-4 lg:justify-center lg:gap-4 lg:text-xl">
										<div className="text-foreground-destructive">
											Error: Region Restricted
										</div>
										<div>
											We've detected you're connecting from{' '}
											{info.requestCountry} but your license has restricted
											access to {info.restrictedCountry}
										</div>
										<div>
											To continue watching uninterrupted, please{' '}
											<a
												href={`https://${host}/products`}
												className="underline"
											>
												upgrade your {displayName} license
											</a>{' '}
											to a full Pro license.
										</div>
									</div>
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										<div>
											<Link
												to={`https://${host}/products`}
												className="underline"
											>
												Upgrade
											</Link>
											{' for transcripts'}
										</div>
									</div>
								</div>
							)
						} else if (info.statusCode === 401) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										{transcriptUI}
									</div>
								</div>
							)
						} else if (info.statusCode === 403) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										<div>
											<Link
												to={`https://${host}/products`}
												className="underline"
											>
												Upgrade
											</Link>
											{' for transcripts'}
										</div>
									</div>
								</div>
							)
						} else if (info.statusCode === 404) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										<div>Transcripts not found</div>
									</div>
								</div>
							)
						} else {
							console.error(info)
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										<div className="text-foreground-destructive">
											Unknown error (check console)
										</div>
									</div>
								</div>
							)
						}
					}}
				</Await>
			</React.Suspense>
		</div>
	)
}

function EpicVideo({
	url: urlString,
	title = extractEpicTitle(urlString),
	muxPlaybackId,
	transcript,
	duration,
	durationEstimate,
	downloadsAvailable,
	downloadSizes,
}: {
	url: string
	title?: string
	muxPlaybackId: string
	transcript: string
	duration?: number | null
	durationEstimate?: number | null
	downloadsAvailable?: boolean
	downloadSizes: Array<OfflineVideoDownloadSize>
}) {
	const muxPlayerRef = React.useRef<MuxPlayerRefAttributes>(null)
	const nativeVideoRef = React.useRef<HTMLVideoElement>(null)
	const isOnline = useIsOnline()
	const playerPreferences = usePlayerPreferences()
	const rootData = useRootLoaderData()
	const downloadResolutionLabel = getOfflineVideoResolutionLabel(
		rootData.preferences?.offlineVideo?.downloadResolution,
	)
	const downloadResolution = getOfflineVideoResolution(
		rootData.preferences?.offlineVideo?.downloadResolution,
	)
	const offlineVideoPlaybackIds = rootData.offlineVideoPlaybackIds
	const offlineVideoAvailable =
		offlineVideoPlaybackIds?.includes(muxPlaybackId) ?? false
	const offlineVideoUrl = `/resources/offline-videos/${encodeURIComponent(muxPlaybackId)}`
	const shouldUseOfflineVideo = offlineVideoAvailable
	const revalidator = useRevalidator()
	const offlineVideoFetcher = useFetcher<OfflineVideoActionData>()
	const isOfflineActionBusy = offlineVideoFetcher.state !== 'idle'
	const [downloadProgress, setDownloadProgress] = React.useState<
		number | undefined
	>(undefined)

	// Subscribe to download progress via SSE when downloading
	const isDownloading = isOfflineActionBusy && !offlineVideoAvailable
	const progressMessage = useEventSource(
		`/resources/offline-video-progress/${encodeURIComponent(muxPlaybackId)}`,
		{ enabled: isDownloading },
	)

	// Process SSE messages for download progress
	React.useEffect(() => {
		if (!progressMessage) return

		try {
			const progress = JSON.parse(progressMessage) as {
				playbackId: string
				bytesDownloaded: number
				totalBytes: number | null
				status: 'downloading' | 'complete' | 'error'
			}

			if (progress.status === 'complete') {
				setDownloadProgress(undefined)
				void revalidator.revalidate()
				return
			}

			if (progress.status === 'error') {
				setDownloadProgress(undefined)
				return
			}

			if (progress.totalBytes && progress.totalBytes > 0) {
				const percent = (progress.bytesDownloaded / progress.totalBytes) * 100
				setDownloadProgress(percent)
			} else {
				// Indeterminate - we don't know the total size
				setDownloadProgress(undefined)
			}
		} catch {
			// Ignore JSON parse errors
		}
	}, [progressMessage, revalidator])

	// Reset progress when download state changes
	React.useEffect(() => {
		if (!isDownloading) {
			setDownloadProgress(undefined)
		}
	}, [isDownloading])

	const currentTimeSessionKey = `${muxPlaybackId}:currentTime`
	const [offlineStartTime, setOfflineStartTime] = React.useState<number | null>(
		null,
	)
	const timestampRegex = /(\d+:\d+)/g
	// turn the transcript into an array of React elements
	const transcriptElements: Array<React.ReactNode> = []
	let match: RegExpExecArray | null
	let prevIndex = 0
	while ((match = timestampRegex.exec(transcript))) {
		const timestamp = match[1]
		if (!timestampRegex.lastIndex || !timestamp || match.index == null) break

		const timestampIndexStart = match.index
		const timestampIndexEnd = timestampRegex.lastIndex
		let textBeforeTimestamp = transcript.slice(prevIndex, timestampIndexStart)
		if (textBeforeTimestamp.endsWith('[')) {
			textBeforeTimestamp = textBeforeTimestamp.slice(0, -1)
		}
		if (textBeforeTimestamp) {
			transcriptElements.push(
				<span key={`span-${timestampIndexStart}`}>{textBeforeTimestamp}</span>,
			)
		}
		transcriptElements.push(
			<button
				key={`button-${timestampIndexStart}`}
				className="underline"
				onClick={(event) => {
					const videoElement = nativeVideoRef.current ?? muxPlayerRef.current
					if (videoElement) {
						videoElement.currentTime = hmsToSeconds(timestamp)
						try {
							void videoElement.play().catch(() => {})
						} catch {
							// ignore
						}
						videoElement.scrollIntoView({
							behavior: 'smooth',
							inline: 'center',
							block: 'start',
						})
						event.currentTarget.blur()
					}
				}}
			>
				{timestamp}
			</button>,
		)
		prevIndex = timestampIndexEnd
		if (transcript.charAt(prevIndex) === ']') {
			prevIndex += 1
		}
	}
	const remainingTranscript = transcript.slice(prevIndex)
	if (remainingTranscript) {
		transcriptElements.push(
			<span key={transcript.length}>{remainingTranscript}</span>,
		)
	}

	React.useEffect(() => {
		if (!nativeVideoRef.current) return
		if (typeof playerPreferences?.playbackRate === 'number') {
			nativeVideoRef.current.playbackRate = playerPreferences.playbackRate
		}
		if (typeof playerPreferences?.volumeRate === 'number') {
			nativeVideoRef.current.volume = playerPreferences.volumeRate
		}
	}, [
		playerPreferences?.playbackRate,
		playerPreferences?.volumeRate,
		shouldUseOfflineVideo,
	])

	React.useEffect(() => {
		if (!shouldUseOfflineVideo) return
		if (typeof document === 'undefined') return
		const stored = sessionStorage.getItem(currentTimeSessionKey)
		if (!stored) {
			setOfflineStartTime(null)
			return
		}
		try {
			const parsed = JSON.parse(stored) as {
				time?: number
				expiresAt?: string
			}
			const expiresAt = parsed.expiresAt
				? new Date(parsed.expiresAt).getTime()
				: 0
			if (
				typeof parsed.time !== 'number' ||
				Number.isNaN(parsed.time) ||
				!expiresAt ||
				expiresAt < Date.now()
			) {
				throw new Error('Time expired')
			}
			setOfflineStartTime(parsed.time)
		} catch {
			sessionStorage.removeItem(currentTimeSessionKey)
			setOfflineStartTime(null)
		}
	}, [currentTimeSessionKey, shouldUseOfflineVideo])

	React.useEffect(() => {
		if (!shouldUseOfflineVideo) return
		const video = nativeVideoRef.current
		if (!video || offlineStartTime == null) return

		const restoreTime = () => {
			const duration = Number.isFinite(video.duration) ? video.duration : 0
			const safeTime = duration
				? Math.min(offlineStartTime, Math.max(duration - 1, 0))
				: offlineStartTime
			if (safeTime > 0) {
				video.currentTime = safeTime
			}
		}

		if (video.readyState >= 1) {
			restoreTime()
			return
		}
		video.addEventListener('loadedmetadata', restoreTime)
		return () => {
			video.removeEventListener('loadedmetadata', restoreTime)
		}
	}, [offlineStartTime, shouldUseOfflineVideo])

	const handleOfflineTimeUpdate = React.useCallback(() => {
		if (typeof document === 'undefined') return
		const video = nativeVideoRef.current
		if (!video) return
		const duration = Number.isFinite(video.duration) ? video.duration : 0
		if (duration && duration - video.currentTime <= 1) {
			sessionStorage.removeItem(currentTimeSessionKey)
			return
		}
		sessionStorage.setItem(
			currentTimeSessionKey,
			JSON.stringify({
				time: video.currentTime,
				expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
			}),
		)
	}, [currentTimeSessionKey])

	React.useEffect(() => {
		if (offlineVideoFetcher.state !== 'idle') return
		const data = offlineVideoFetcher.data
		if (!data) return

		if (data.action === 'delete' && data.status === 'success') {
			void revalidator.revalidate()
		} else if (data.action === 'download' && data.status === 'error') {
			const description =
				data.message ??
				'Offline video download failed. Check the terminal logs.'
			toast.error('Offline video download failed', { description })
		}
	}, [offlineVideoFetcher.state, offlineVideoFetcher.data, revalidator])

	const handleDownload = React.useCallback(() => {
		toast.success(
			`Download of ${title} has started (${downloadResolutionLabel} quality).`,
			{
				description: (
					<span>
						Go to{' '}
						<Link className="underline" to="/preferences">
							Preferences
						</Link>{' '}
						to download all workshop videos at once.
					</span>
				),
			},
		)
		void offlineVideoFetcher.submit(
			{
				intent: 'download-video',
				playbackId: muxPlaybackId,
				title,
				url: urlString,
			},
			{ method: 'post', action: '/resources/offline-videos' },
		)
	}, [
		muxPlaybackId,
		offlineVideoFetcher,
		title,
		urlString,
		downloadResolutionLabel,
	])

	const handleDelete = React.useCallback(() => {
		void offlineVideoFetcher.submit(
			{ intent: 'delete-video', playbackId: muxPlaybackId },
			{ method: 'post', action: '/resources/offline-videos' },
		)
	}, [muxPlaybackId, offlineVideoFetcher])
	const setSeekOffset = React.useCallback((element: HTMLElement | null) => {
		if (!element) return
		element.setAttribute('seekoffset', '10')
	}, [])
	const hasDownloadOptions = Boolean(
		downloadsAvailable || downloadSizes.length > 0,
	)
	const downloadSizeBytes = getPreferredDownloadSize(
		downloadSizes,
		downloadResolution,
	)
	const showOfflineActions = offlineVideoAvailable || hasDownloadOptions
	const offlineActions = showOfflineActions ? (
		<OfflineVideoActionButtons
			isAvailable={offlineVideoAvailable}
			isBusy={isOfflineActionBusy}
			downloadProgress={downloadProgress}
			downloadSizeBytes={downloadSizeBytes}
			onDownload={handleDownload}
			onDelete={handleDelete}
		/>
	) : null
	return (
		<div>
			<div className="shadow-lg">
				{shouldUseOfflineVideo ? (
					<div className="flex aspect-video w-full items-center justify-center bg-black">
						<MediaController
							tabIndex={0}
							aria-label={`${title} video player`}
							onPointerDown={(event) => {
								event.currentTarget.focus()
							}}
							className="focus-visible:ring-ring flex h-full w-full flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							style={
								{
									'--media-primary-color': 'hsl(var(--background))',
									'--media-text-color': 'hsl(var(--background))',
									'--media-secondary-color': 'transparent',
									'--media-control-background': 'transparent',
									'--media-control-hover-background':
										'hsl(var(--background) / 0.18)',
									'--media-control-height': '18px',
									'--media-range-padding': '2px',
									'--media-time-range-hover-height': '18px',
									'--media-time-range-hover-bottom': '-4px',
									'--media-range-track-height': '3px',
									'--media-range-thumb-height': '8px',
									'--media-range-thumb-width': '8px',
									'--media-range-track-background':
										'hsl(var(--background) / 0.35)',
									'--media-range-track-pointer-background':
										'hsl(var(--background) / 0.85)',
								} as React.CSSProperties
							}
						>
							<video
								ref={nativeVideoRef}
								slot="media"
								aria-label={title}
								className="h-full w-full"
								playsInline
								preload="metadata"
								src={offlineVideoUrl}
								onTimeUpdate={handleOfflineTimeUpdate}
							/>
							<div className="bg-foreground/40 text-background w-full space-y-1 px-3 pt-1 pb-1.5 text-sm leading-none backdrop-blur select-none">
								<MediaTimeRange className="w-full" />
								<MediaControlBar className="w-full items-center gap-3">
									<div className="flex items-center gap-3">
										<MediaPlayButton />
										<MediaSeekBackwardButton
											ref={setSeekOffset}
											seekOffset={10}
										/>
										<MediaSeekForwardButton
											ref={setSeekOffset}
											seekOffset={10}
										/>
										<MediaTimeDisplay
											showDuration
											className="text-background text-xs tabular-nums"
										/>
										<MediaMuteButton />
										<MediaVolumeRange className="w-24" />
									</div>
									<div className="ml-auto flex items-center gap-3">
										<MediaPlaybackRateButton
											className="text-background text-xs"
											rates={[
												0.5, 0.75, 0.8, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5,
												4,
											]}
										/>
										<MediaPipButton />
										<MediaFullscreenButton />
									</div>
								</MediaControlBar>
							</div>
						</MediaController>
					</div>
				) : !isOnline ? (
					<OfflineVideoUnavailable />
				) : (
					<MuxPlayer
						playbackId={muxPlaybackId}
						muxPlayerRef={muxPlayerRef}
						title={title}
					/>
				)}
			</div>
			<div className="mt-4 flex flex-col gap-2">
				<VideoLink
					url={urlString}
					title={title}
					duration={duration}
					durationEstimate={durationEstimate}
					actions={offlineActions}
				/>
				<details>
					<summary>Transcript</summary>
					<div className="bg-accent text-accent-foreground rounded-md p-2 whitespace-pre-line">
						{transcriptElements}
					</div>
				</details>
			</div>
		</div>
	)
}

function hmsToSeconds(str: string) {
	const p = str.split(':')
	let s = 0
	let m = 1

	while (p.length > 0) {
		s += m * parseInt(p.pop() ?? '0', 10)
		m *= 60
	}
	return s
}

function formatDuration(seconds: number): string {
	const totalSeconds = Math.max(0, Math.round(seconds))
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const secs = totalSeconds % 60

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
	}
	return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function EpicVideoEmbed({
	url: urlString,
	title,
}: {
	url: string
	title: string
}) {
	const theme = useTheme()
	let url: URL = new URL('https://epicweb.dev')
	try {
		url = new URL(urlString)
	} catch (error) {
		console.error(error)
		return <div>Invalid URL: "{urlString}"</div>
	}
	url.pathname = url.pathname.endsWith('/')
		? `${url.pathname}embed`
		: `${url.pathname}/embed`
	url.searchParams.set('theme', theme)
	// special case for epicai.pro videos
	if (
		url.host === 'www.epicai.pro' &&
		!url.pathname.startsWith('/workshops/')
	) {
		url.pathname = `/posts/${url.pathname}`
	}
	return (
		<VideoEmbed
			url={url.toString()}
			title={title}
			loadingContent={
				<Loading>
					<span>
						{'Loading "'}
						<a className="underline" href={urlString}>
							{title}
						</a>
						{'"'}
					</span>
				</Loading>
			}
		/>
	)
}
