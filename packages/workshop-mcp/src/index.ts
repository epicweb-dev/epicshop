#!/usr/bin/env node

import { getEnv } from '@epic-web/workshop-utils/init-env'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as Sentry from '@sentry/node'
import { initPrompts } from './prompts.ts'
import { initResources } from './resources.ts'
import { serverInstructions } from './server-metadata.ts'
import { initPromptTools, initResourceTools, initTools } from './tools.ts'

// Get environment variables
const env = getEnv()

// Initialize Sentry if published and DSN is available
if (env.EPICSHOP_IS_PUBLISHED && env.SENTRY_DSN) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		sendDefaultPii: true,
		environment: env.EPICSHOP_IS_PUBLISHED ? 'production' : 'development',
		tracesSampleRate: 1.0,
	})
}

// Create server instance
const server = new McpServer(
	{
		name: 'epicshop',
		version: '1.0.0',
	},
	// TODO: add some common workflows to the instructions
	{
		instructions: serverInstructions,
	},
)

// Wrap with Sentry if enabled
const monitoredServer =
	env.EPICSHOP_IS_PUBLISHED && env.SENTRY_DSN
		? Sentry.wrapMcpServerWithSentry(server)
		: server

initTools(monitoredServer)
initResourceTools(monitoredServer)
initResources(monitoredServer)
initPrompts(monitoredServer)
initPromptTools(monitoredServer)

async function main() {
	const transport = new StdioServerTransport()
	await monitoredServer.connect(transport)
	console.error('epicshop MCP Server running on stdio')
}

main().catch((error) => {
	console.error('Fatal error in main():', error)
	process.exit(1)
})
