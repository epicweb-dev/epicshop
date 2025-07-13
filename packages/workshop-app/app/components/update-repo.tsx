import { type checkForUpdatesCached } from '@epic-web/workshop-utils/git.server'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useFetcher } from 'react-router'

export function UpdateToast({
	repoUpdates,
}: {
	repoUpdates: Awaited<ReturnType<typeof checkForUpdatesCached>>
}) {
	const { updatesAvailable } = repoUpdates
	const diffLink = 'diffLink' in repoUpdates ? repoUpdates.diffLink : null
	const remoteCommit = 'remoteCommit' in repoUpdates ? repoUpdates.remoteCommit : undefined
	const fetcher = useFetcher()

	// Track the in-progress toast id and update notification id
	const inProgressToastId = useRef<ReturnType<typeof toast.loading> | null>(
		null,
	)
	const updateNotificationId = useRef<ReturnType<typeof toast.info> | null>(
		null,
	)
	const updateInProgress = useRef(false)

	useEffect(() => {
		if (updatesAvailable && remoteCommit) {
			const id = toast.info('New workshop updates available', {
				duration: Infinity,
				description: (
					<div>
						{`Get the latest updates by clicking the update button. `}
						{diffLink ? (
							<a
								href={diffLink}
								target="_blank"
								rel="noreferrer"
								className="text-xs underline"
							>
								View changes
							</a>
						) : null}
					</div>
				),
				onDismiss: () => {
					// No-op for now, could call a dismiss endpoint if needed
				},
				action: {
					label: 'Update',
					onClick: async () => {
						// Dismiss the update notification immediately
						if (updateNotificationId.current) {
							toast.dismiss(updateNotificationId.current)
							updateNotificationId.current = null
						}
						// Show in-progress toast
						if (!inProgressToastId.current) {
							inProgressToastId.current = toast.loading('Update in progress...')
						}
						if (updateInProgress.current) return
						updateInProgress.current = true
						try {
							const { EPICSHOP_PARENT_PORT, EPICSHOP_PARENT_TOKEN } =
								window.ENV || {}
							if (!EPICSHOP_PARENT_PORT || !EPICSHOP_PARENT_TOKEN) {
								throw new Error('Update API not available')
							}
							const res = await fetch(
								`http://localhost:${EPICSHOP_PARENT_PORT}/__epicshop-restart`,
								{
									method: 'POST',
									headers: {
										'x-epicshop-token': EPICSHOP_PARENT_TOKEN,
									},
								},
							)
							if (!res.ok) {
								throw new Error(
									`Request to update workshop failed: ${res.statusText}`,
								)
							}
							const data = await res.json().catch(() => ({}))
							const schema = z.object({
								status: z.enum(['ok', 'error']),
								message: z.string().optional(),
							})
							const parsed = schema.safeParse(data)
							if (!parsed.success) {
								console.error('Invalid response from update API', data)
								throw new Error('Invalid response from update API')
							}
							const { status, message } = parsed.data
							if (status === 'ok') {
								let reloaded = false
								toast.success('Workshop updated', {
									description:
										'Reloading in 2 seconds... You can reload now if you prefer.',
									duration: 2000,
									action: {
										label: 'Reload now',
										onClick: () => {
											reloaded = true
											window.location.reload()
										},
									},
									onAutoClose: () => {
										if (!reloaded) {
											window.location.reload()
										}
									},
								})
							} else {
								toast.error('Failed to update workshop', {
									description: message || 'Unknown error',
								})
							}
						} catch (err) {
							toast.error('Failed to update workshop', {
								description: err instanceof Error ? err.message : String(err),
							})
						} finally {
							updateInProgress.current = false
							if (inProgressToastId.current) {
								toast.dismiss(inProgressToastId.current)
								inProgressToastId.current = null
							}
						}
					},
				},
				cancel: {
					label: 'Dismiss',
					onClick: () => {
						// Dismiss the notification toast
						if (updateNotificationId.current) {
							toast.dismiss(updateNotificationId.current)
							updateNotificationId.current = null
						}
						// Mute the notification persistently
						void fetcher.submit(
							{ intent: 'mute', id: `update-repo-${remoteCommit}` },
							{ method: 'post', action: '/admin/notifications' },
						)
					},
				},
			})
			updateNotificationId.current = id
		}
	}, [updatesAvailable, diffLink, remoteCommit])

	return null
}