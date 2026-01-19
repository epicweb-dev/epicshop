import { getEnv } from '@epic-web/workshop-utils/env.server'
import {
	getCommitInfo,
	getLatestWorkshopAppVersion,
} from '@epic-web/workshop-utils/git.server'
import {
	combineServerTimings,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import { dayjs } from '@epic-web/workshop-utils/utils.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { type HeadersFunction, data } from 'react-router'
import { getErrorMessage } from '#app/utils/misc.tsx'
import Version from './version.client.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader() {
	const timings = makeTimings('versionLoader')
	const [commitInfo, latestVersion] = await Promise.all([
		time(() => getCommitInfo(), { timings, type: 'getCommitInfo' }),
		time(() => getLatestWorkshopAppVersion().catch((e) => getErrorMessage(e)), {
			timings,
			type: 'getLatestWorkshopAppVersion',
		}),
	])

	const uptime = process.uptime() * 1000
	const startDate = new Date(Date.now() - uptime)

	return data(
		{
			workshopInstanceId: getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID,
			workshopContextCwd: getEnv().EPICSHOP_CONTEXT_CWD,
			workshopCommit: commitInfo
				? {
						...commitInfo,
						dateFormatted: dayjs(commitInfo.date).format('YYYY-MM-DD HH:mm:ss'),
						dateFromNow: dayjs(commitInfo.date).fromNow(),
					}
				: null,
			latestWorkshopAppVersion: latestVersion,
			workshopAppVersion: getEnv().EPICSHOP_APP_VERSION,
			startTime: startDate.toISOString(),
			startTimeFormatted: dayjs(startDate).format('YYYY-MM-DD HH:mm:ss'),
			startTimeFromNow: dayjs(startDate).fromNow(),
		},
		{
			headers: {
				'Server-Timing': timings.toString(),
			},
		},
	)
}

export const headers: HeadersFunction = ({ parentHeaders, loaderHeaders }) => {
	return {
		'Server-Timing': combineServerTimings(parentHeaders, loaderHeaders),
	}
}

export default function VersionRoute() {
	return <Version />
}
