import { muteNotification } from '@epic-web/workshop-utils/db.server'
import { type getUnmutedNotifications } from '@epic-web/workshop-utils/notifications.server'
import { json } from "@react-router/node";
import { type ActionFunctionArgs } from 'react-router';
import { useFetcher } from 'react-router';
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	const id = formData.get('id')
	if (typeof id !== 'string') {
		return json({ error: 'Invalid notification id' }, { status: 400 })
	}
	if (intent === 'mute') {
		await muteNotification(id)
		return json({ success: true })
	}
	return json({ error: 'Invalid intent' }, { status: 400 })
}

export function Notifications({
	unmutedNotifications,
}: {
	unmutedNotifications: Awaited<ReturnType<typeof getUnmutedNotifications>>
}) {
	const fetcher = useFetcher<typeof action>()
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
						fetcherRef.current.submit(
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
