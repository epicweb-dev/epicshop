import { requireExerciseApp } from '@epic-web/workshop-utils/apps.server'
import {
	combineServerTimings,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { useRef } from 'react'
import {
	data,
	type HeadersFunction,
	type LoaderFunctionArgs,
	useLoaderData,
} from 'react-router'
import { type InBrowserBrowserRef } from '#app/components/in-browser-browser.ts'
import { Preview } from './__shared/preview.tsx'
import { getAppRunningState } from './__shared/utils.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('exercise-step-test')
	const exerciseStepApp = await requireExerciseApp(params, { request, timings })
	const { isRunning, portIsAvailable } =
		await getAppRunningState(exerciseStepApp)

	return data(
		{
			appInfo: {
				isRunning,
				name: exerciseStepApp.name,
				title: exerciseStepApp.title,
				portIsAvailable,
				type: exerciseStepApp.type,
				fullPath: exerciseStepApp.fullPath,
				dev: exerciseStepApp.dev,
				test: exerciseStepApp.test,
				stackBlitzUrl: exerciseStepApp.stackBlitzUrl,
			},
		},
		{
			headers: {
				'Server-Timing': timings.toString(),
			},
		},
	)
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function TestsList() {
	const { appInfo } = useLoaderData<typeof loader>()
	const ref = useRef<InBrowserBrowserRef>(null)

	return <Preview appInfo={appInfo} inBrowserBrowserRef={ref} />
}
