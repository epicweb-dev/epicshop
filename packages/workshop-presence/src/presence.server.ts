import {
	cachified,
	makeSingletonCache,
} from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getAuthInfo, getPreferences } from '@epic-web/workshop-utils/db.server'
import {
	getUserInfo,
	userHasAccessToWorkshop,
} from '@epic-web/workshop-utils/epic-api.server'
import { type Timings } from '@epic-web/workshop-utils/timing.server'
import { getUserId } from '@epic-web/workshop-utils/user.server'
import { PresenceSchema, partykitBaseUrl, type User } from './presence.ts'

export const presenceCache = makeSingletonCache<Array<User>>('PresenceCache')

export async function getPresentUsers({
	timings,
	request,
}: { timings?: Timings; request?: Request } = {}): Promise<Array<User>> {
	const presence = await cachified({
		key: 'presence',
		cache: presenceCache,
		timings,
		request,
		ttl: 1000 * 2,
		swr: 1000 * 60 * 60 * 24,
		offlineFallbackValue: { users: [] },
		checkValue: PresenceSchema,
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
				return presence
			} catch {
				// console.error(err)
				context.metadata.ttl = 300
				return { users: [] }
			}
		},
	})
	const { users } = presence

	const authInfo = await getAuthInfo()
	const userId = request
		? (await getUserId({ request })).id
		: (authInfo?.id ?? null)

	const preferences = await getPreferences()

	if (preferences?.presence.optOut || !userId) {
		return uniqueUsers(users.filter((u) => u.id !== userId))
	} else {
		const user: User = { id: userId }
		const config = getWorkshopConfig()
		const url = request ? new URL(request.url) : undefined
		user.location = {
			workshopTitle: config.title,
			origin: url ? url.origin : undefined,
		}
		if (url) {
			if (url.pathname.startsWith('/exercise/')) {
				const [exerciseNumber, stepNumber, type] = url.pathname
					.split('/')
					.slice(2)
				user.location.exercise = {
					exerciseNumber: isNaN(Number(exerciseNumber))
						? null
						: Number(exerciseNumber),
					stepNumber: isNaN(Number(stepNumber)) ? null : Number(stepNumber),
					type:
						type === 'problem'
							? 'problem'
							: type === 'solution'
								? 'solution'
								: null,
				}
			}
		}

		if (authInfo) {
			const [userInfo, hasAccess] = await Promise.all([
				getUserInfo({ request, timings }),
				userHasAccessToWorkshop({ request, timings }),
			])

			Object.assign(user, {
				name: userInfo?.name,
				avatarUrl: userInfo?.imageUrlLarge,
				imageUrlSmall: userInfo?.imageUrlSmall,
				imageUrlLarge: userInfo?.imageUrlLarge,
				hasAccess,
			})
		}

		return uniqueUsers([...users, user])
	}
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
