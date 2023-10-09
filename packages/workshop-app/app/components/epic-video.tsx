import { type MuxPlayerRefAttributes } from '@mux/mux-player-react'
import { Await, Link } from '@remix-run/react'
import * as React from 'react'
import { useTheme } from '#app/routes/theme/index.tsx'
import { MuxPlayer } from '#app/routes/video-player/index.tsx'
import { type EpicVideoInfos } from '#app/utils/epic-api.ts'
import { cn } from '#app/utils/misc.tsx'
import { Icon } from './icons.tsx'
import { Loading } from './loading.tsx'

const EpicVideoInfoContext = React.createContext<
	Promise<EpicVideoInfos> | null | undefined
>(null)

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
		return 'EpicWeb.dev Video'
	}
	const urlSegments = url.pathname.split('/').filter(Boolean)
	const isSolution = urlSegments.includes('solution')
	let titleSegment = urlSegments.pop()
	const nonTitles = ['problem', 'solution', 'embed', 'exercise']
	const isTitleSegment = (str?: string) => str && !nonTitles.includes(str)
	while (!isTitleSegment(titleSegment)) titleSegment = urlSegments.pop()

	if (!titleSegment) return 'EpicWeb.dev Video'

	const titleWords = titleSegment.split('-')
	// prettier-ignore
	const titleCaseExcludeWords = [
		'the', 'a', 'an', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
		'from', 'by', 'of', 'in', 'with', 'as', 'npm', 'git', 'ssh', 'cli'
	]
	// prettier-ignore
	const allCapsWords = [
		'ui', 'ux', 'api', 'css', 'html', 'js', 'ts', 'svg', 'ai',
		'http', 'https', 'url', 'uri',
	]
	const title = titleWords
		.filter(Boolean)
		.map((word, index) =>
			titleCaseExcludeWords.includes(word) && index > 0
				? word
				: word[0]?.toUpperCase() + word.slice(1),
		)
		.map(word =>
			allCapsWords.includes(word.toLowerCase()) ? word.toUpperCase() : word,
		)
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
	const [iframeLoaded, setIframeLoaded] = React.useState(false)

	return (
		<div className="relative aspect-video w-full flex-shrink-0 shadow-lg dark:shadow-gray-800">
			{!iframeLoaded ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					{loadingContent}
				</div>
			) : null}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				src={url}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
				title={title}
				sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
				allowFullScreen
			/>
		</div>
	)
}

function VideoLink({ url, title }: { url: string; title: string }) {
	return (
		// eslint-disable-next-line react/jsx-no-target-blank
		<a
			href={url}
			target="_blank"
			className="flex items-center gap-1 text-base no-underline opacity-70 transition hover:underline hover:opacity-100"
			rel="noreferrer"
		>
			<Icon name="Video" size={24} title="EpicWeb.dev video" />
			{title} <span aria-hidden>↗︎</span>
		</a>
	)
}
export function DeferredEpicVideo({
	url,
	title = extractEpicTitle(url),
}: {
	url: string
	title?: string
}) {
	const epicVideoInfosPromise = React.useContext(EpicVideoInfoContext)
	const linkUI = (
		<div>
			<VideoLink url={url} title={title} />
		</div>
	)
	return (
		<div>
			<React.Suspense
				fallback={
					<div>
						<div className="flex aspect-video w-full items-center justify-center">
							<Loading>{title}</Loading>
						</div>
						<div className="mt-4 flex flex-wrap justify-between">
							<div className="h-8 min-w-[240px]" />
							{linkUI}
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
					{epicVideoInfos => {
						const epicVideoInfo = epicVideoInfos?.[url]
						const transcriptUI = (
							<div className="min-w-[240px]">
								<Link to="/login" className="underline">
									Login
								</Link>
								{' for transcripts'}
							</div>
						)
						if (!epicVideoInfo) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex min-h-[32px] flex-wrap items-center justify-between">
										{transcriptUI}
										{linkUI}
									</div>
								</div>
							)
						}
						const info = epicVideoInfo
						if (info.status === 'success') {
							return (
								<EpicVideo
									url={url}
									title={title}
									muxPlaybackId={info.muxPlaybackId}
									transcript={info.transcript}
								/>
							)
						} else if (info.statusCode === 401) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex min-h-[32px] flex-wrap items-center justify-between">
										{transcriptUI}
										{linkUI}
									</div>
								</div>
							)
						} else if (info.statusCode === 403) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex min-h-[32px] flex-wrap items-center justify-between">
										<div className="min-w-[240px]">
											<Link
												to="https://www.epicweb.dev/products"
												className="underline"
											>
												Upgrade
											</Link>
											{' for transcripts'}
										</div>
										{linkUI}
									</div>
								</div>
							)
						} else if (info.statusCode === 404) {
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex min-h-[32px] flex-wrap items-center justify-between">
										<div className="min-w-[240px]">Transcripts not found</div>
										{linkUI}
									</div>
								</div>
							)
						} else {
							console.error(info)
							return (
								<div>
									<EpicVideoEmbed url={url} title={title} />
									<div className="mt-4 flex min-h-[32px] flex-wrap items-center justify-between">
										<div className="min-w-[240px]">
											Unknown error (check console)
										</div>
										{linkUI}
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
}: {
	url: string
	title?: string
	muxPlaybackId: string
	transcript: string
}) {
	const muxPlayerRef = React.useRef<MuxPlayerRefAttributes>(null)
	const timestampRegex = /(\d+:\d+)/g
	// turn the transcript into an array of React elements
	const transcriptElements: Array<React.ReactNode> = []
	let match
	let prevIndex = 0
	while ((match = timestampRegex.exec(transcript))) {
		const timestamp = match[1]
		if (!timestampRegex.lastIndex || !timestamp) break

		const timestampIndexStart = match.index
		const timestampIndexEnd = timestampRegex.lastIndex
		const textBeforeTimestamp = transcript.slice(
			prevIndex + 1,
			timestampIndexStart - 1,
		)
		transcriptElements.push(
			<span key={timestampIndexStart}>{textBeforeTimestamp}</span>,
		)
		transcriptElements.push(
			<button
				key={timestamp}
				className="underline"
				onClick={event => {
					if (muxPlayerRef.current) {
						muxPlayerRef.current.currentTime = hmsToSeconds(timestamp)
						muxPlayerRef.current.play()
						muxPlayerRef.current.scrollIntoView({
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
	}
	transcriptElements.push(
		<span key={transcript.length}>
			{transcript.slice(prevIndex + 1, transcript.length)}
		</span>,
	)
	return (
		<div>
			<div className="shadow-lg dark:shadow-gray-800">
				<MuxPlayer playbackId={muxPlaybackId} muxPlayerRef={muxPlayerRef} />
			</div>
			<div className="relative mt-4">
				<details>
					<summary>Transcript</summary>
					<div className="whitespace-pre-line rounded-md bg-accent p-2 text-accent-foreground">
						{transcriptElements}
					</div>
				</details>
				<div className="absolute right-0 top-1">
					<VideoLink url={urlString} title={title} />
				</div>
			</div>
		</div>
	)
}

function hmsToSeconds(str: any) {
	let p = str.split(':'),
		s = 0,
		m = 1

	while (p.length > 0) {
		s += m * parseInt(p.pop(), 10)
		m *= 60
	}
	return s
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
