import { invariantResponse } from '@epic-web/invariant'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
	markOnboardingVideoWatched,
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
import { Button } from '#app/components/button.tsx'
import {
	DeferredEpicVideo,
	EpicVideoInfoProvider,
} from '#app/components/epic-video.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('onboarding')

	const { onboardingVideo: onboardingVideos } = getWorkshopConfig()
	const videoInfos = getEpicVideoInfos(onboardingVideos, { request, timings })
	const onboarding = await readOnboardingData()
	const watchedVideos = onboarding?.tourVideosWatched ?? []
	
	return data(
		{ 
			onboardingVideos, 
			videoInfos, 
			watchedVideos,
			allWatched: onboardingVideos.every(video => watchedVideos.includes(video))
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
	const authInfo = await getAuthInfo()
	const intent = formData.get('intent')
	invariantResponse(intent === 'complete', 'Invalid intent')
	const { onboardingVideo: onboardingVideos } = getWorkshopConfig()
	
	// Check which videos have not been watched and mark them as watched
	const onboarding = await readOnboardingData()
	const watchedVideos = onboarding?.tourVideosWatched ?? []
	
	for (const videoUrl of onboardingVideos) {
		if (!watchedVideos.includes(videoUrl)) {
			await markOnboardingVideoWatched(videoUrl)
		}
	}

	if (authInfo) throw redirect('/')
	else throw redirect('/login')
}

export default function Onboarding() {
	const data = useLoaderData<typeof loader>()
	const { onboardingVideos, watchedVideos, allWatched } = data
	const videosCount = onboardingVideos.length
	const watchedCount = onboardingVideos.filter(video => watchedVideos.includes(video)).length
	
	return (
		<main className="flex h-full w-full flex-col items-center justify-between gap-4">
			<div className="container flex h-full w-full max-w-5xl flex-1 flex-col items-center gap-4 overflow-y-scroll py-12 scrollbar-thin scrollbar-thumb-scrollbar">
				<h1 className="text-5xl">Onboarding</h1>
				<p className="text-xl">Welcome to EpicWeb.dev!</p>
				<p className="text-lg">
					Before you get started, <strong>you must watch the tour {videosCount > 1 ? 'videos' : 'video'}</strong>
					! You're going to be spending a lot of time in here, so it's important
					you understand how to work effectively in this workshop
				</p>
				
				{videosCount > 1 && (
					<div className="mb-4 text-center">
						<div className="text-lg font-semibold">
							Progress: {watchedCount} of {videosCount} videos completed
						</div>
						<div className="mt-2 w-full max-w-md mx-auto bg-muted-foreground/20 rounded-full h-2">
							<div 
								className="bg-foreground h-2 rounded-full transition-all duration-300"
								style={{ width: `${(watchedCount / videosCount) * 100}%` }}
							/>
						</div>
					</div>
				)}
				
				<div className="w-[780px] max-w-full space-y-8">
					<EpicVideoInfoProvider epicVideoInfosPromise={data.videoInfos}>
						{onboardingVideos.map((videoUrl, index) => {
							const isWatched = watchedVideos.includes(videoUrl)
							return (
								<div key={videoUrl} className="space-y-4">
									{videosCount > 1 && (
										<div className="flex items-center gap-2">
											<h2 className="text-2xl font-semibold">
												Video {index + 1}
											</h2>
											{isWatched && (
												<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
													✓ Watched
												</span>
											)}
										</div>
									)}
									<DeferredEpicVideo url={videoUrl} />
								</div>
							)
						})}
					</EpicVideoInfoProvider>
				</div>
			</div>
			<Form method="post" className="pb-4">
				<Button 
					name="intent" 
					value="complete" 
					varient="primary"
					disabled={!allWatched}
				>
					{allWatched 
						? "I've watched them all. Let's go!" 
						: `Watch ${videosCount > 1 ? 'all videos' : 'the video'} to continue`
					}
				</Button>
			</Form>
		</main>
	)
}
