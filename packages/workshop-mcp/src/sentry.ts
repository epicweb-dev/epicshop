import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getEnv } from '@epic-web/workshop-utils/env.server'

// Simple wrapper function that follows the blog post pattern
export function wrapMcpServerWithSentry(server: McpServer): McpServer {
	// Only enable Sentry if we have a DSN and are in production
	const env = getEnv()
	if (!env.SENTRY_DSN || !env.EPICSHOP_IS_PUBLISHED) {
		return server
	}

	// For now, just return the server as-is
	// The actual Sentry integration will be added when the official SDK supports it
	// This follows the pattern mentioned in the blog post: wrapMcpServerWithSentry(McpServer)
	console.log('Sentry MCP monitoring enabled (placeholder for future integration)')
	
	return server
}