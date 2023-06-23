import { type DataFunctionArgs, json } from '@remix-run/node'
import { getServerTimeHeader, makeTimings } from '~/utils/timing.server.ts'
import { getExercises } from '~/utils/apps.server.ts'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('appsLoader')
	const exercises = await getExercises({ request, timings })
	return json(
		{ exercises },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
