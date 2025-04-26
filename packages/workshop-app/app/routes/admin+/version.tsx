import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { getErrorMessage } from '#app/utils/misc.tsx'
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
import { data, useLoaderData, type HeadersFunction } from 'react-router'

export const handle: SEOHandle = { getSitemapEntries: () => null }

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
			workshopCommit: commitInfo
				? {
						...commitInfo,
						dateFormatted: dayjs(commitInfo.date).format('YYYY-MM-DD HH:mm:ss'),
						dateFromNow: dayjs(commitInfo.date).fromNow(),
					}
				: null,
			latestWorkshopAppVersion: latestVersion,
			startTime: startDate.toISOString(),
			startTimeFormatted: dayjs(startDate).format('YYYY-MM-DD HH:mm:ss'),
			startTimeFromNow: dayjs(startDate).fromNow(),
		},
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: HeadersFunction = ({ parentHeaders, loaderHeaders }) => {
	return { 'Server-Timing': combineServerTimings(parentHeaders, loaderHeaders) }
}

export default function Version() {
	const data = useLoaderData<typeof loader>()
	const workshopConfig = useWorkshopConfig()

	return (
		<div>
			<h2 className="text-lg font-bold">Workshop Version Information</h2>
			<h3 className="text-md font-bold">Workshop Commit</h3>
			{data.workshopCommit ? (
				<>
					<p>
						Hash:{' '}
						<a
							href={`${workshopConfig.githubRepo}/commit/${data.workshopCommit.hash}`}
							className="underline"
						>
							{data.workshopCommit.hash}
						</a>
					</p>
					<p>Message: {data.workshopCommit.message}</p>
					<p>
						Date: {data.workshopCommit.dateFormatted} (
						{data.workshopCommit.dateFromNow})
					</p>
				</>
			) : (
				<p>No commit information available</p>
			)}
			<h3 className="text-md font-bold">Workshop App</h3>
			<p>
				{'Current Version: '}
				{ENV.EPICSHOP_APP_VERSION ? (
					<a
						href={`https://github.com/epicweb-dev/epicshop/releases/tag/v${ENV.EPICSHOP_APP_VERSION}`}
						className="underline"
					>
						{ENV.EPICSHOP_APP_VERSION}
					</a>
				) : (
					'Unknown'
				)}
			</p>
			<p>
				{'Latest Version: '}
				<a
					href={`https://github.com/epicweb-dev/epicshop/releases/tag/v${data.latestWorkshopAppVersion}`}
					className="underline"
				>
					{data.latestWorkshopAppVersion}
				</a>
			</p>
			<h3 className="text-md font-bold">App Start Time</h3>
			<p>
				{data.startTimeFormatted} ({data.startTimeFromNow})
			</p>
		</div>
	)
}
