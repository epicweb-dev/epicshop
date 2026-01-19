'use client'

import { type getUnmutedNotifications } from '@epic-web/workshop-utils/notifications.server'
import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'

type NotificationsActionData = { success?: true; error?: string }

export function Notifications({
	unmutedNotifications,
}: {
	unmutedNotifications: Awaited<ReturnType<typeof getUnmutedNotifications>>
}) {
	const fetcher = useFetcher<NotificationsActionData>()
	const fetcherRef = useRef(fetcher)
	const toastedIds = useRef<Set<string>>(new Set())

	useEffect(() => {
		for (const notification of unmutedNotifications) {
			if (toastedIds.current.has(notification.id)) continue
			toastedIds.current.add(notification.id)

			toast.info(notification.title, {
				id: notification.id,
				description: (
					<div>
						<p>{notification.message}</p>
						{notification.link && (
							<a
								href={notification.link}
								target="_blank"
								className="text-xs underline"
							>
								Learn more
							</a>
						)}
					</div>
				),
				duration: Infinity,
				action: {
					label: 'Dismiss',
					onClick: () => {
						void fetcherRef.current.submit(
							{ intent: 'mute', id: notification.id },
							{ method: 'post', action: '/admin/notifications' },
						)
					},
				},
			})
		}
	}, [unmutedNotifications])

	return null
}
