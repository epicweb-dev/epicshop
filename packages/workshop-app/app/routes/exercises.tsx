import { getExercises } from '@kentcdodds/workshop-utils/apps.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@kentcdodds/workshop-utils/timing.server'
import { type LoaderFunctionArgs, json } from '@remix-run/node'

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('appsLoader')
	const exercises = await getExercises({ request, timings })
	return json(
		{ exercises },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
