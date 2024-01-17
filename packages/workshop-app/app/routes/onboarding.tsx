import {
	defer,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type HeadersFunction,
	redirect,
} from '@remix-run/node'
import { Form, useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import {
	DeferredEpicVideo,
	EpicVideoInfoProvider,
} from '#app/components/epic-video.tsx'
import { getEpicVideoInfos } from '#app/utils/epic-api.ts'
import { invariantResponse } from '#app/utils/misc.tsx'
import { updateOnboardingData } from '#utils/db.server.ts'
import { makeTimings } from '#utils/timing.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('onboarding')

	const tourUrl =
		'https://www.epicweb.dev/tips/get-started-with-the-epic-workshop-app'
	const videoInfos = getEpicVideoInfos([tourUrl], { request, timings })
	return defer(
		{ tourUrl, videoInfos },
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
	const data = await request.formData()
	const intent = data.get('intent')
	invariantResponse(intent === 'complete', 'Invalid intent')
	await updateOnboardingData({ finishedTourVideo: true })
	throw redirect('/account')
}

export default function Onboarding() {
	const data = useLoaderData<typeof loader>()
	return (
		<main className="flex h-full w-full flex-col items-center justify-between gap-4">
			<div className="container flex h-full w-full max-w-5xl flex-1 flex-col items-center gap-4 overflow-y-scroll py-12 scrollbar-thin scrollbar-thumb-scrollbar">
				<h1 className="text-5xl">Onboarding</h1>
				<p className="text-xl">Welcome to EpicWeb.dev!</p>
				<p className="text-lg">
					Before you get started, <strong>you must watch the tour video</strong>
					! You're going to be spending a lot of time in here, so it's important
					you understand how to work effectively in this workshop
				</p>
				<div className="w-[780px] max-w-full">
					<EpicVideoInfoProvider epicVideoInfosPromise={data.videoInfos}>
						<DeferredEpicVideo url={data.tourUrl} />
					</EpicVideoInfoProvider>
				</div>
			</div>
			<Form method="post" className="pb-4">
				<Button name="intent" value="complete" varient="primary">
					I've watched it. Let's go!
				</Button>
			</Form>
		</main>
	)
}
