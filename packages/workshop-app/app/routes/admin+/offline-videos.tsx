import {
	deleteAllOfflineVideos,
	deleteOfflineVideo,
	deleteOfflineVideosForWorkshopId,
	getOfflineVideoAdminSummary,
} from '@epic-web/workshop-utils/offline-videos.server'
import { Form, data, redirect } from 'react-router'
import { formatBytes } from '#app/utils/format.ts'
import { cn, ensureUndeployed, useDoubleCheck } from '#app/utils/misc.tsx'
import { type Route } from './+types/offline-videos.tsx'

export async function loader({ request: _request }: Route.LoaderArgs) {
	ensureUndeployed()
	const summary = await getOfflineVideoAdminSummary()
	return data({ summary })
}

export async function action({ request }: Route.ActionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete-video') {
		const playbackId = formData.get('playbackId')
		if (typeof playbackId !== 'string' || playbackId.length === 0) {
			return data(
				{ status: 'error', message: 'Missing playbackId' },
				{ status: 400 },
			)
		}
		await deleteOfflineVideo(playbackId)
		return redirect('/admin/offline-videos')
	}

	if (intent === 'delete-workshop') {
		const workshopId = formData.get('workshopId')
		if (typeof workshopId !== 'string' || workshopId.length === 0) {
			return data(
				{ status: 'error', message: 'Missing workshopId' },
				{ status: 400 },
			)
		}
		await deleteOfflineVideosForWorkshopId(workshopId)
		return redirect('/admin/offline-videos')
	}

	if (intent === 'delete-all') {
		await deleteAllOfflineVideos()
		return redirect('/admin/offline-videos')
	}

	return data({ status: 'error', message: 'Unknown intent' }, { status: 400 })
}

function DoubleCheckButton({
	children,
	confirmLabel = 'Confirm',
	className,
	...props
}: React.ComponentPropsWithoutRef<'button'> & {
	confirmLabel?: string
}) {
	const { doubleCheck, getButtonProps } = useDoubleCheck()

	return (
		<button
			{...getButtonProps(props)}
			className={cn(
				'border-border bg-background text-foreground focus:ring-ring inline-flex min-w-[120px] items-center justify-center gap-2 rounded-md border px-3 py-1 text-sm font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none disabled:opacity-50',
				doubleCheck
					? 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground'
					: 'hover:bg-muted hover:text-foreground',
				className,
			)}
		>
			<span className="grid items-center justify-center">
				<span aria-hidden className="col-start-1 row-start-1 opacity-0">
					{children}
				</span>
				<span aria-hidden className="col-start-1 row-start-1 opacity-0">
					{confirmLabel}
				</span>
				<span className="col-start-1 row-start-1">
					{doubleCheck ? confirmLabel : children}
				</span>
			</span>
		</button>
	)
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
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">Downloads</h2>
				<Form method="post">
					<DoubleCheckButton type="submit" name="intent" value="delete-all">
						Delete all downloads
					</DoubleCheckButton>
				</Form>
			</div>
			{summary.workshops.map((workshop) => (
				<section key={workshop.id} className="border-border rounded border p-4">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 className="text-lg font-semibold">{workshop.title}</h2>
						<div className="flex flex-wrap items-center gap-3">
							<span className="text-muted-foreground text-sm">
								{workshop.videos.length} video
								{workshop.videos.length === 1 ? '' : 's'} ·{' '}
								{formatBytes(workshop.totalBytes)}
							</span>
							<Form method="post">
								<input type="hidden" name="workshopId" value={workshop.id} />
								<DoubleCheckButton
									type="submit"
									name="intent"
									value="delete-workshop"
								>
									Delete workshop downloads
								</DoubleCheckButton>
							</Form>
						</div>
					</div>
					<div className="mt-3 overflow-x-auto">
						<table className="border-border w-full border text-sm">
							<thead className="bg-muted text-foreground">
								<tr>
									<th className="border-border border px-3 py-2 text-left">
										Title
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
									<th className="border-border w-[140px] border px-3 py-2 text-left">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{workshop.videos.map((video) => (
									<tr key={`${workshop.id}-${video.playbackId}`}>
										<td className="border-border max-w-[360px] border px-3 py-2">
											<a
												href={video.url}
												target="_blank"
												rel="noreferrer"
												className="block truncate underline-offset-4 hover:underline"
											>
												{video.title}
											</a>
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
										<td className="border-border w-[140px] border px-3 py-2">
											<Form method="post">
												<input
													type="hidden"
													name="playbackId"
													value={video.playbackId}
												/>
												<DoubleCheckButton
													type="submit"
													name="intent"
													value="delete-video"
													className="w-full"
												>
													Delete
												</DoubleCheckButton>
											</Form>
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
