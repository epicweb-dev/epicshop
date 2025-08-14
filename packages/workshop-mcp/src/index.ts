#!/usr/bin/env node

import { getEnv } from '@epic-web/workshop-utils/env.server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as Sentry from '@sentry/node'
import { initPrompts } from './prompts.js'
import { initResources } from './resources.js'
import { initPromptTools, initResourceTools, initTools } from './tools.js'

// Get environment variables
const env = getEnv()

// Initialize Sentry if published and DSN is available
if (env.EPICSHOP_IS_PUBLISHED && env.SENTRY_DSN) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		tracesSampleRate: 1.0,
		environment: env.EPICSHOP_IS_PUBLISHED ? 'production' : 'development',
	})
}

// Create server instance
const server = new McpServer(
	{
		name: 'epicshop',
		version: '1.0.0',
		capabilities: {
			tools: {},
		},
	},
	{
		instructions: `
This is intended to be used within a workshop using the Epic Workshop App
(@epic-web/workshop-app) to help learners in the process of completing the
workshop exercises and understanding the learning outcomes.

The user's work in progress is in the \`playground\` directory. Any changes they
ask you to make should be in this directory.
		`.trim(),
	},
)

// Wrap with Sentry if enabled
const monitoredServer = env.EPICSHOP_IS_PUBLISHED && env.SENTRY_DSN 
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
