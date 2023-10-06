import RealMuxPlayer from '@mux/mux-player-react'
import { Await } from '@remix-run/react'
import * as React from 'react'
import { useTheme } from '#app/routes/theme/index.tsx'
import { type EpicVideoInfos } from '#app/utils/epic-api.ts'
import { cn } from '#app/utils/misc.tsx'
import { Icon } from './icons.tsx'
import { Loading } from './loading.tsx'

// Pretty sure their types are wrong in an ESM environment... 🤷‍♂️
const MuxPlayer = RealMuxPlayer as unknown as typeof RealMuxPlayer.default

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
		'from', 'by', 'of', 'in', 'with', 'as',
	]
	const allCapsWords = ['ui', 'ux', 'api', 'css', 'html', 'js', 'ts', 'svg']
	const title = titleWords
		.filter(Boolean)
		.map((word, index) =>
			titleCaseExcludeWords.includes(word) && index > 0
				? word
				: word[0]?.toUpperCase() + word.slice(1),
		)
		.map(word => (allCapsWords.includes(word) ? word.toUpperCase() : word))
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

export function usePreboundEpicVideo(
	epicVideoInfosPromise?: EpicVideoInfos | Promise<EpicVideoInfos> | null,
) {
	return React.useMemo(() => {
		if (!epicVideoInfosPromise) return EpicVideo

		return function DeferredPreboundEpicVideo({
			url,
			title = extractEpicTitle(url),
		}: {
			url: string
			title?: string
		}) {
			return (
				<React.Suspense fallback={<Loading>{title}</Loading>}>
					<Await
						errorElement={
							<div>
								Sorry, failed loading videos. Check the terminal output?
							</div>
						}
						resolve={epicVideoInfosPromise}
					>
						{epicVideoInfos => {
							const epicVideoInfo = epicVideoInfos[url]
							if (!epicVideoInfo) return <EpicVideo url={url} title={title} />
							const info = epicVideoInfo
							if (info.status === 'success') {
								// TODO: do something about the info.transcript
								return (
									<EpicVideo
										url={url}
										title={title}
										muxPlaybackId={info.muxPlaybackId}
									/>
								)
							} else if (info.statusCode === 401) {
								// TODO: add login button inline
								return <EpicVideoEmbed url={url} title={title} />
							} else if (info.statusCode === 403) {
								// TODO: mention lack of sufficient access, and upgrade button
								return <EpicVideoEmbed url={url} title={title} />
							} else {
								// TODO: mention unknown error (maybe render info.statusText?)
								return <EpicVideoEmbed url={url} title={title} />
							}
						}}
					</Await>
				</React.Suspense>
			)
		}
	}, [epicVideoInfosPromise])
}

export function EpicVideo({
	url: urlString,
	title = extractEpicTitle(urlString),
	muxPlaybackId,
}: {
	url: string
	title?: string
	muxPlaybackId?: string
}) {
	return (
		<div>
			{/* eslint-disable-next-line react/jsx-no-target-blank */}
			<a
				href={urlString}
				target="_blank"
				className="flex items-center gap-1 underline"
			>
				<Icon name="Video" size={24} title="EpicWeb.dev video" />
				{title}
				<Icon name="ExternalLink" title="Open video" />
			</a>
			{muxPlaybackId ? (
				<MuxPlayer playbackId={muxPlaybackId} />
			) : (
				<EpicVideoEmbed url={urlString} title={title} />
			)}
		</div>
	)
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
