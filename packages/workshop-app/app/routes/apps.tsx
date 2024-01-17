import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { getApps } from '#app/utils/apps.server.ts'
import { getServerTimeHeader, makeTimings } from '#app/utils/timing.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('appsLoader')
	const apps = await getApps({ request, timings })
	return json(
		{ apps },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
