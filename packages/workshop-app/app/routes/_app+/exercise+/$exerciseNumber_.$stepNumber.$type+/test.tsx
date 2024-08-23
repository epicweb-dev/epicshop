import { requireExerciseApp } from '@epic-web/workshop-utils/apps.server'
import {
	combineServerTimings,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import {
	type HeadersFunction,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { TestUI } from './__shared/tests.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('exercise-step-test')
	const exerciseStepApp = await requireExerciseApp(params, { request, timings })

	return json({
		appInfo: {
			name: exerciseStepApp?.name,
			test: exerciseStepApp?.test,
		},
	})
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function TestsList() {
	const { appInfo } = useLoaderData<typeof loader>()

	return <TestUI playgroundAppInfo={appInfo} />
}
