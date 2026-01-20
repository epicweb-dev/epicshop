type SentryUser = {
	id?: string
	email?: string
}

type SentryUserSource = {
	user?: { id?: string | null; email?: string | null } | null
	userId?: { id?: string | null } | null
}

const UNKNOWN_EMAIL = 'unknown@example.com'

export function getSentryUser({
	user,
	userId,
}: SentryUserSource): SentryUser | null {
	const id = user?.id ?? userId?.id ?? undefined
	const email =
		user?.email && user.email !== UNKNOWN_EMAIL ? user.email : undefined

	if (!id && !email) return null

	const sentryUser: SentryUser = {}
	if (id) sentryUser.id = id
	if (email) sentryUser.email = email
	return sentryUser
}
