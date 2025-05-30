import { muteNotification } from '@epic-web/workshop-utils/db.server'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { type getUnmutedNotifications } from './notifications.server'

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

	useEffect(() => {
		for (const notification of unmutedNotifications) {
			toast.info(notification.title, {
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
