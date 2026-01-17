import { getOfflineVideoAdminSummary } from '@epic-web/workshop-utils/offline-videos.server'
import { data } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { type Route } from './+types/offline-videos.tsx'

export async function loader({ request: _request }: Route.LoaderArgs) {
	ensureUndeployed()
	const summary = await getOfflineVideoAdminSummary()
	return data({ summary })
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	if (kb < 1024) return `${kb.toFixed(1)} KB`
	const mb = kb / 1024
	if (mb < 1024) return `${mb.toFixed(1)} MB`
	return `${(mb / 1024).toFixed(1)} GB`
}

export default function OfflineVideosAdmin({
	loaderData,
}: Route.ComponentProps) {
	const { summary } = loaderData
	if (summary.workshops.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No offline videos are downloaded yet.
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			{summary.workshops.map((workshop) => (
				<section key={workshop.id} className="border-border rounded border p-4">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 className="text-lg font-semibold">{workshop.title}</h2>
						<span className="text-muted-foreground text-sm">
							{workshop.videos.length} video
							{workshop.videos.length === 1 ? '' : 's'} ·{' '}
							{formatBytes(workshop.totalBytes)}
						</span>
					</div>
					<div className="mt-3 overflow-x-auto">
						<table className="border-border w-full border text-sm">
							<thead className="bg-muted text-foreground">
								<tr>
									<th className="border-border border px-3 py-2 text-left">
										Title
									</th>
									<th className="border-border border px-3 py-2 text-left">
										Playback ID
									</th>
									<th className="border-border border px-3 py-2 text-left">
										Status
									</th>
									<th className="border-border border px-3 py-2 text-left">
										Size
									</th>
									<th className="border-border border px-3 py-2 text-left">
										Updated
									</th>
								</tr>
							</thead>
							<tbody>
								{workshop.videos.map((video) => (
									<tr key={`${workshop.id}-${video.playbackId}`}>
										<td className="border-border max-w-[320px] border px-3 py-2">
											<span className="truncate">{video.title}</span>
										</td>
										<td className="border-border max-w-[200px] border px-3 py-2">
											<span className="truncate">{video.playbackId}</span>
										</td>
										<td className="border-border border px-3 py-2">
											{video.status}
										</td>
										<td className="border-border border px-3 py-2">
											{video.size ? formatBytes(video.size) : '—'}
										</td>
										<td className="border-border border px-3 py-2">
											{new Date(video.updatedAt).toLocaleString()}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			))}
		</div>
	)
}
