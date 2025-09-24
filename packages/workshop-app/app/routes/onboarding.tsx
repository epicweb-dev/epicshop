import { invariantResponse } from '@epic-web/invariant'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
	markOnboardingVideoWatched,
	unmarkOnboardingVideoWatched,
	readOnboardingData,
} from '@epic-web/workshop-utils/db.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	data,
	redirect,
	type ActionFunctionArgs,
	type HeadersFunction,
	type LoaderFunctionArgs,
	Form,
	useLoaderData,
} from 'react-router'
import { ButtonLink } from '#app/components/button.tsx'
import {
	DeferredEpicVideo,
	EpicVideoInfoProvider,
} from '#app/components/epic-video.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { cn } from '#app/utils/misc.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('onboarding')

	const { onboardingVideo: onboardingVideos } = getWorkshopConfig()
	const videoInfos = getEpicVideoInfos(onboardingVideos, { request, timings })
	const onboarding = await readOnboardingData()
	const watchedVideos = onboarding?.tourVideosWatched ?? []
	// We expose auth state so we can decide where to link the user next without a form post.
	const isAuthenticated = Boolean(await getAuthInfo())

	return data(
		{
			onboardingVideos,
			videoInfos,
			watchedVideos,
			allWatched: onboardingVideos.every((video) =>
				watchedVideos.includes(video),
			),
			isAuthenticated,
		},
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
	const headers = {
		'Server-Timing': loaderHeaders.get('Server-Timing') ?? '',
	}
	return headers
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'mark-video') {
		const videoUrl = formData.get('videoUrl')
		invariantResponse(typeof videoUrl === 'string', 'Invalid video URL')
		await markOnboardingVideoWatched(videoUrl)
		return redirect('/onboarding')
	}

	if (intent === 'unmark-video') {
		const videoUrl = formData.get('videoUrl')
		invariantResponse(typeof videoUrl === 'string', 'Invalid video URL')
		await unmarkOnboardingVideoWatched(videoUrl)
		return redirect('/onboarding')
	}

	invariantResponse(false, 'Invalid intent')
}

export default function Onboarding() {
	const data = useLoaderData<typeof loader>()
	const { onboardingVideos, watchedVideos, allWatched, isAuthenticated } = data
	const videosCount = onboardingVideos.length

	return (
		<main className="flex w-full flex-col items-center justify-between gap-4 overflow-y-scroll scrollbar-thin scrollbar-thumb-scrollbar">
			<div className="container flex h-full w-full max-w-5xl flex-1 flex-col items-center gap-4 py-12">
				<h1 className="text-5xl">Onboarding</h1>
				<p className="text-xl">Welcome to EpicWeb.dev!</p>
				<p className="text-lg">
					Before you get started,{' '}
					<strong>
						you must watch the tour {videosCount > 1 ? 'videos' : 'video'}
					</strong>
					! You're going to be spending a lot of time in here, so it's important
					you understand how to work effectively in this workshop
				</p>

				<div className="w-[780px] max-w-full space-y-8">
					<EpicVideoInfoProvider epicVideoInfosPromise={data.videoInfos}>
						{onboardingVideos.map((videoUrl, index) => {
							const isWatched = watchedVideos.includes(videoUrl)
							return (
								<div key={videoUrl} className="space-y-4">
									{onboardingVideos.length > 1 ? (
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-2">
												<h2 className="text-2xl font-semibold">
													Video {index + 1} of {videosCount}
												</h2>
											</div>
										</div>
									) : null}
									<DeferredEpicVideo
										url={videoUrl}
										bottomRightUI={
											<Form method="post" className="flex" preventScrollReset>
												<input type="hidden" name="videoUrl" value={videoUrl} />
												<SimpleTooltip
													content={`Click here to ${isWatched ? 'unmark' : 'mark'} this video as watched`}
												>
													<button
														type="submit"
														name="intent"
														value={isWatched ? 'unmark-video' : 'mark-video'}
														data-watched={isWatched ? 'true' : 'false'}
														className={cn(
															`inline-flex items-center gap-1 self-start rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring`,
															isWatched
																? 'border-success bg-success text-success-foreground hover:border-success-foreground hover:shadow-sm'
																: 'border-warning bg-warning text-warning-foreground hover:border-warning-foreground hover:shadow-sm',
														)}
													>
														<span aria-hidden="true">
															{isWatched ? '✓' : '✕'}
														</span>{' '}
														{isWatched ? 'Watched' : 'Mark as watched'}
													</button>
												</SimpleTooltip>
											</Form>
										}
									/>
								</div>
							)
						})}
					</EpicVideoInfoProvider>
				</div>
			</div>
			<div className="pb-4">
				{allWatched ? (
					<ButtonLink to={isAuthenticated ? '/' : '/login'} varient="primary">
						{`I've watched ${videosCount > 1 ? 'them all' : 'it'}. Let's go!`}
					</ButtonLink>
				) : (
					<ButtonLink
						to="#"
						onClick={(e) => {
							e.preventDefault()
							// focus the first data-watched="false" button
							const firstUnwatchedButton = document.querySelector(
								'button[data-watched="false"]',
							)
							if (!(firstUnwatchedButton instanceof HTMLButtonElement)) return
							firstUnwatchedButton.focus()
						}}
						varient="primary"
						className="opacity-60"
					>
						{`Mark ${videosCount > 1 ? 'all videos' : 'the video'} as watched to continue`}
					</ButtonLink>
				)}
			</div>
		</main>
	)
}
