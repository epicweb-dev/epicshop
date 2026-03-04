import type { Route } from './+types/apps'
import { getApps } from '@epic-web/workshop-utils/apps.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { data } from 'react-router'

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('appsLoader')
	const apps = await getApps({ request, timings })
	return data(
		{ apps },
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
	)
}
