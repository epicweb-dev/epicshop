import type { User } from '@sentry/react-router'

/**
 * Sets the user context in Sentry for error reporting
 * @param userId - The user ID to set in Sentry
 * @param userType - The type of user ID (e.g., 'cookie.clientId', 'db.authInfo', etc.)
 */
export async function setSentryUserContext(
	userId: string,
	userType?: string,
) {
	try {
		const Sentry = await import('@sentry/react-router')
		
		const user: User = {
			id: userId,
		}

		// Add additional context if available
		if (userType) {
			user.ip_address: '{{auto}}' // Sentry will automatically detect IP
		}

		Sentry.setUser(user)
		
		// Also set as a tag for easier filtering
		Sentry.setTag('user_type', userType || 'unknown')
		
		console.log('Sentry user context set:', { userId, userType })
	} catch (error) {
		// Silently fail if Sentry is not available
		console.warn('Failed to set Sentry user context:', error)
	}
}

/**
 * Clears the user context in Sentry
 */
export async function clearSentryUserContext() {
	try {
		const Sentry = await import('@sentry/react-router')
		Sentry.setUser(null)
		Sentry.setTag('user_type', null)
		console.log('Sentry user context cleared')
	} catch (error) {
		// Silently fail if Sentry is not available
		console.warn('Failed to clear Sentry user context:', error)
	}
}