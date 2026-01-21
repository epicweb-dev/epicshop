// eslint-disable-next-line import/order -- this must be first
import { getEnv } from './init-env.ts'

import json5 from 'json5'
import { z } from 'zod'
import { cachified, notificationsCache } from './cache.server.ts'
import { getWorkshopConfig } from './config.server.ts'
import { getMutedNotifications } from './db.server.ts'

const NotificationSchema = z.object({
	id: z.string(),
	title: z.string(),
	message: z.string(),
	link: z.string().optional(),
	type: z.enum(['info', 'warning', 'danger']),
	products: z
		.array(
			z.object({
				host: z.string(),
				slug: z.string().optional(),
			}),
		)
		.optional(),
	expiresAt: z
		.string()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
})

// Schema for validating cached notifications (post-transform, with Date objects)
const CachedNotificationSchema = z.object({
	id: z.string(),
	title: z.string(),
	message: z.string(),
	link: z.string().optional(),
	type: z.enum(['info', 'warning', 'danger']),
	products: z
		.array(
			z.object({
				host: z.string(),
				slug: z.string().optional(),
			}),
		)
		.optional(),
	expiresAt: z.instanceof(Date).nullable(),
})

export type Notification = z.infer<typeof NotificationSchema>

async function getRemoteNotifications() {
	return cachified({
		key: 'notifications',
		cache: notificationsCache,
		ttl: 1000 * 60 * 60 * 6,
		swr: 1000 * 60 * 60 * 24,
		offlineFallbackValue: [],
		checkValue: CachedNotificationSchema.array(),
		async getFreshValue() {
			const URL =
				'https://gist.github.com/kentcdodds/c3aaa5141f591cdbb0e6bfcacd361f39'
			const filename = 'notifications.json5'
			const response = await fetch(`${URL}/raw/${filename}`)
			const text = await response.text()
			const json = json5.parse(text)

			return NotificationSchema.array().parse(json)
		},
	}).catch(() => [])
}

export async function getUnmutedNotifications() {
	if (getEnv().EPICSHOP_DEPLOYED) return []

	const remoteNotifications = await getRemoteNotifications()

	const config = getWorkshopConfig()

	const notificationsToShow = remoteNotifications
		.filter((n) => {
			if (n.expiresAt && n.expiresAt < new Date()) {
				return false
			}
			return true
		})
		.filter((n) => {
			if (!n.products) return true
			return n.products.some((p) => {
				return (
					p.host === config.product.host &&
					(p.slug ? p.slug === config.product.slug : true)
				)
			})
		})
		.concat(config.notifications)

	const muted = await getMutedNotifications()

	const visibleNotifications = notificationsToShow.filter(
		(n) => !muted.includes(n.id),
	)

	return visibleNotifications
}
