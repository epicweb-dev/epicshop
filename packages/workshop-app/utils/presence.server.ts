import { z } from 'zod'
import { cachified, presenceCache } from './cache.server.ts'
import { getPreferences } from './db.server.ts'
import {
	PresenceSchema,
	type User,
	UserSchema,
	partykitBaseUrl,
} from './presence.ts'
import { type Timings } from './timing.server.ts'

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
				const response = await fetch(`${partykitBaseUrl}/presence`)
				if (!response.ok) {
					throw new Error(
						`Unexpected response from partykit: ${response.status} ${response.statusText}`,
					)
				}
				const presence = PresenceSchema.parse(await response.json())
				const preferences = await getPreferences()
				const users = presence.users
				if (preferences?.presence.optOut || !user) {
					return uniqueUsers(users.filter(u => u.id !== user?.id))
				} else {
					return uniqueUsers([...users, user])
				}
			} catch (err) {
				console.error(err)
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
	return users.filter(user => {
		if (seen.has(user.id)) {
			return false
		}
		seen.add(user.id)
		return true
	})
}
