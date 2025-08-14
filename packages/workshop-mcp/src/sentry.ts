import * as Sentry from '@sentry/node'

// Initialize Sentry for MCP server monitoring
export function initSentry() {
	// Check if SENTRY_DSN environment variable is set
	const dsn = process.env.SENTRY_DSN
	
	if (!dsn) {
		console.warn('SENTRY_DSN not set, Sentry monitoring disabled')
		return
	}

	try {
		Sentry.init({
			dsn,
			// Set the environment
			environment: process.env.NODE_ENV || 'development',
			// Set the release version
			release: process.env.npm_package_version || '1.0.0',
			// Enable performance monitoring
			enableTracing: true,
			// Set traces sample rate (1.0 = 100% of transactions)
			tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
			// Set profiles sample rate (1.0 = 100% of transactions)
			profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
			// Add MCP-specific tags
			initialScope: {
				tags: {
					service: 'mcp-server',
					server_name: 'epicshop',
					protocol: 'mcp'
				}
			},
			// Configure beforeSend to filter out sensitive data
			beforeSend(event) {
				// Remove potentially sensitive data from MCP requests
				if (event.request?.data) {
					// Filter out sensitive fields that might be in MCP requests
					const filteredData = { ...event.request.data }
					delete filteredData.password
					delete filteredData.token
					delete filteredData.secret
					event.request.data = filteredData
				}
				return event
			}
		})

		console.log('Sentry initialized successfully for MCP server monitoring')
	} catch (error) {
		console.error('Failed to initialize Sentry:', error)
	}
}

// Helper function to capture MCP-specific errors
export function captureMcpError(error: Error, context?: Record<string, any>) {
	try {
		Sentry.captureException(error, {
			tags: {
				error_type: 'mcp_error',
				...context
			}
		})
	} catch (sentryError) {
		// Fallback to console if Sentry fails
		console.error('Failed to capture error in Sentry:', sentryError)
		console.error('Original error:', error)
	}
}

// Helper function to start a performance transaction (simplified)
export function startMcpTransaction(name: string, operation: string) {
	try {
		// For now, just return a simple object that mimics the transaction interface
		// This avoids compatibility issues with the Sentry transaction API
		return {
			setStatus: (status: string) => {
				addMcpBreadcrumb(`Transaction ${name} status: ${status}`, 'transaction', { operation, status })
			},
			finish: () => {
				addMcpBreadcrumb(`Transaction ${name} finished`, 'transaction', { operation })
			}
		}
	} catch (error) {
		console.warn('Failed to start Sentry transaction:', error)
		return null
	}
}

// Helper function to add breadcrumbs for MCP operations
export function addMcpBreadcrumb(message: string, category: string, data?: Record<string, any>) {
	try {
		Sentry.addBreadcrumb({
			message,
			category,
			data,
			level: 'info'
		})
	} catch (error) {
		// Silently fail if Sentry is not available
	}
}