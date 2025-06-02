import { getMutedNotifications } from '@epic-web/workshop-utils/db.server'

type Notification = {
	id: string
	title: string
	message: string
	link?: string
	type: 'info' | 'warning' | 'danger'
	expiresAt: Date | null
}

const NOTIFICATIONS: Array<Notification> = [
	{
		id: 'introducing-mcp-server-2025-05-30',
		title: 'Introducing the epicshop MCP Server',
		message:
			'Use natural language to interact with this workshop and enhance your learning experience.',
		type: 'info',
		link: 'https://www.epicai.pro/introducing-the-epic-workshop-mcp-dj11t',
		expiresAt: null,
	},
]

export async function getUnmutedNotifications() {
	if (ENV.EPICSHOP_DEPLOYED) return []

	const muted = await getMutedNotifications()

	const visibleNotifications = NOTIFICATIONS.filter((n) => {
		if (n.expiresAt && n.expiresAt < new Date()) {
			return false
		}
		return true
	}).filter((n) => !muted.includes(n.id))

	return visibleNotifications
}
