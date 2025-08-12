import { useEffect } from 'react'
import { setSentryUserContext, clearSentryUserContext } from '../utils/sentry-context'

/**
 * Hook to set Sentry user context for error reporting
 * @param userId - The user ID to set in Sentry
 * @param userType - The type of user ID (e.g., 'cookie.clientId', 'db.authInfo', etc.)
 */
export function useSentryUser(userId?: string | null, userType?: string) {
	useEffect(() => {
		if (userId) {
			setSentryUserContext(userId, userType)
		} else {
			clearSentryUserContext()
		}
	}, [userId, userType])
}

/**
 * Hook to set Sentry user context from user object
 * @param user - User object with id and optional type
 */
export function useSentryUserFromObject(user?: { id: string; type?: string } | null) {
	useEffect(() => {
		if (user?.id) {
			setSentryUserContext(user.id, user.type)
		} else {
			clearSentryUserContext()
		}
	}, [user?.id, user?.type])
}