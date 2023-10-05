import { type DataFunctionArgs, json } from '@remix-run/node'
import { getExercises } from '#app/utils/apps.server.ts'
import { getServerTimeHeader, makeTimings } from '#app/utils/timing.server.ts'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('appsLoader')
	const exercises = await getExercises({ request, timings })
	return json(
		{ exercises },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
