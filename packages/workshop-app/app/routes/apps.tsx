import { type DataFunctionArgs, json } from '@remix-run/node'
import { getApps } from '~/utils/apps.server.ts'
import { getServerTimeHeader, makeTimings } from '~/utils/timing.server.ts'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('appsLoader')
	const apps = await getApps({ request, timings })
	return json(
		{ apps },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
