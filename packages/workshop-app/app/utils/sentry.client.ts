import { captureExceptionWithUser } from './monitoring.client'

// Helper function to capture client-side errors with user context
export function captureClientError(
	error: Error,
	user?: any,
	clientId?: string,
) {
	captureExceptionWithUser(error, user, clientId)
}

// Helper function to capture client-side errors from React components
export function captureReactError(error: Error, _errorInfo?: any) {
	// Try to get user context from the current route data
	try {
		// This will be called from React components where we have access to hooks
		// The user and clientId should be passed in when calling this function
		captureExceptionWithUser(error, undefined, undefined)
	} catch (sentryError) {
		console.error('Failed to capture error in Sentry:', sentryError)
		// Fallback to basic error capture
		captureExceptionWithUser(error)
	}
}
