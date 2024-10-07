import { getApps } from '@epic-web/workshop-utils/apps.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { unstable_data as data, type LoaderFunctionArgs } from '@remix-run/node'

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('appsLoader')
	const apps = await getApps({ request, timings })
	return data(
		{ apps },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
