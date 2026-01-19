'use client'

import { useLoaderData } from 'react-router'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { type loader } from './version.tsx'

export default function Version() {
	const data = useLoaderData<typeof loader>()
	const workshopConfig = useWorkshopConfig()

	return (
		<div>
			<h2 className="text-lg font-bold">Workshop Version Information</h2>
			<p>Workshop Instance ID: {data.workshopInstanceId}</p>
			<p>Workshop Context CWD: {data.workshopContextCwd}</p>
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
				{data.workshopAppVersion ? (
					<a
						href={`https://github.com/epicweb-dev/epicshop/releases/tag/v${data.workshopAppVersion}`}
						className="underline"
					>
						{data.workshopAppVersion}
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
