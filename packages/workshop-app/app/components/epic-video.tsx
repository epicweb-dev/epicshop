import { type MuxPlayerRefAttributes } from '@mux/mux-player-react'
import { Await, Link } from '@remix-run/react'
import * as React from 'react'
import { useTheme } from '#app/routes/theme/index.tsx'
import { MuxPlayer } from '#app/routes/video-player/index.tsx'
import { type EpicVideoInfos } from '#app/utils/epic-api.ts'
import { cn } from '#app/utils/misc.tsx'
import { Icon } from './icons.tsx'
import { Loading } from './loading.tsx'
import { useOptionalUser } from './user.tsx'

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
	const [iframeLoaded, setIframeLoaded] = React.useState(false)

	return (
		<div className="relative aspect-video w-full flex-shrink-0 shadow-lg dark:shadow-gray-800">
			{iframeLoaded ? null : (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
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
			/>
		</div>
	)
}

function VideoLink({ url, title }: { url: string; title: string }) {
	return (
		<a
			href={url}
			target="_blank"
			className="flex items-center gap-1 text-base no-underline opacity-70 transition hover:underline hover:opacity-100"
			rel="noreferrer"
		>
			<Icon className="flex-shrink-0" name="Video" size="lg" />
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
	const user = useOptionalUser()
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
								{ENV.EPICSHOP_GITHUB_ROOT ? (
									<Link to={ENV.EPICSHOP_GITHUB_ROOT} className="underline">
										Run locally
									</Link>
								) : (
									'Run locally'
								)}
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
									title={title}
									muxPlaybackId={info.muxPlaybackId}
									transcript={info.transcript}
								/>
							)
						} else if (info.type === 'region-restricted') {
							return (
								<div>
									<div className="flex aspect-video min-h-full min-w-full flex-col items-center justify-start gap-2 overflow-y-scroll border-2 p-4 lg:justify-center lg:gap-4 lg:text-xl">
										<div className="!text-foreground-danger">
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
												href="https://www.epicweb.dev/products/full-stack-vol-1"
												className="underline"
											>
												upgrade your EpicWeb.dev license
											</a>{' '}
											to a full Pro license.
										</div>
									</div>
									<div className="mt-4 flex flex-col gap-2">
										{linkUI}
										<div>
											<Link
												to="https://www.epicweb.dev/products"
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
												to="https://www.epicweb.dev/products"
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
										<div className="!text-foreground-danger">
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
				onClick={(event) => {
					if (muxPlayerRef.current) {
						muxPlayerRef.current.currentTime = hmsToSeconds(timestamp)
						void muxPlayerRef.current.play()
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
				<MuxPlayer
					playbackId={muxPlaybackId}
					muxPlayerRef={muxPlayerRef}
					title={title}
				/>
			</div>
			<div className="mt-4 flex flex-col gap-2">
				<VideoLink url={urlString} title={title} />
				<details>
					<summary>Transcript</summary>
					<div className="whitespace-pre-line rounded-md bg-accent p-2 text-accent-foreground">
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
