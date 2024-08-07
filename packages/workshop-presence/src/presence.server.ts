import {
	cachified,
	makeSingletonCache,
} from '@epic-web/workshop-utils/cache.server'
import { getPreferences } from '@epic-web/workshop-utils/db.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import { z } from 'zod'
import {
	PresenceSchema,
	UserSchema,
	partykitBaseUrl,
	type User,
} from './presence.js'

export const presenceCache = makeSingletonCache<
	Array<{
		id: string
		avatarUrl: string
		name: string | null | undefined
	}>
>('PresenceCache')

export async function getPresentUsers(
	user?: User | null,
	{ timings, request }: { timings?: Timings; request?: Request } = {},
) {
	return cachified({
		key: 'presence',
		cache: presenceCache,
		timings,
		request,
		ttl: 1000 * 60 * 5,
		swr: 1000 * 60 * 60 * 24,
		checkValue: z.array(UserSchema),
		async getFreshValue(context) {
			try {
				const response = await Promise.race([
					fetch(`${partykitBaseUrl}/presence`),
					new Promise<Response>((resolve) =>
						setTimeout(() => {
							resolve(new Response('Timeout', { status: 500 }))
						}, 500),
					),
				] as const)
				if (response.statusText === 'Timeout') {
					throw new Error(`Timeout fetching partykit presence`)
				}
				if (!response.ok) {
					throw new Error(
						`Unexpected response from partykit: ${response.status} ${response.statusText}`,
					)
				}
				const presence = PresenceSchema.parse(await response.json())
				const preferences = await getPreferences()
				const users = presence.users
				if (preferences?.presence.optOut ?? !user) {
					return uniqueUsers(users.filter((u) => u.id !== user?.id))
				} else {
					return uniqueUsers([...users, user])
				}
			} catch {
				// console.error(err)
				context.metadata.ttl = 300
				return []
			}
		},
	})
}

// A user maybe on the same page in multiple tabs
// so let's make sure we only show them once
function uniqueUsers(users: Array<User>) {
	const seen = new Set()
	return users.filter(Boolean).filter((user) => {
		if (seen.has(user.id)) {
			return false
		}
		seen.add(user.id)
		return true
	})
}
