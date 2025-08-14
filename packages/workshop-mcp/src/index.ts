#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { initPrompts } from './prompts.js'
import { initResources } from './resources.js'
import { initPromptTools, initResourceTools, initTools } from './tools.js'
import { wrapMcpServerWithSentry } from './sentry.js'
import closeWithGrace from 'close-with-grace'

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

// Wrap the server with Sentry monitoring (following the blog post pattern)
const monitoredServer = wrapMcpServerWithSentry(server)

// Initialize server components
initTools(monitoredServer)
initResourceTools(monitoredServer)
initResources(monitoredServer)
initPrompts(monitoredServer)
initPromptTools(monitoredServer)

async function main() {
	try {
		// Create transport and connect
		const transport = new StdioServerTransport()
		await monitoredServer.connect(transport)
		
		console.error('epicshop MCP Server running on stdio')
	} catch (error) {
		console.error('Fatal error in main():', error)
		process.exit(1)
	}
}

// Handle graceful shutdown
const closeListeners = closeWithGrace({ delay: 500 }, async function (opts) {
	console.error('Shutting down MCP server gracefully...')
	process.exit(0)
})

// Clean up on process exit
process.on('exit', () => {
	closeListeners.uninstall()
})

main().catch((error) => {
	console.error('Fatal error in main():', error)
	process.exit(1)
})
