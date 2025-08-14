#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { initPrompts } from './prompts.js'
import { initResources } from './resources.js'
import { initPromptTools, initResourceTools, initTools } from './tools.js'
import { initSentry, captureMcpError, startMcpTransaction, addMcpBreadcrumb } from './sentry.js'

// Initialize Sentry monitoring
initSentry()

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

// Initialize server components with Sentry monitoring
async function initializeServerComponents() {
	const transaction = startMcpTransaction('initialize_server_components', 'mcp.server.init')
	
	try {
		addMcpBreadcrumb('Initializing MCP server components', 'server.init')
		
		initTools(server)
		addMcpBreadcrumb('Tools initialized', 'server.init')
		
		initResourceTools(server)
		addMcpBreadcrumb('Resource tools initialized', 'server.init')
		
		initResources(server)
		addMcpBreadcrumb('Resources initialized', 'server.init')
		
		initPrompts(server)
		addMcpBreadcrumb('Prompts initialized', 'server.init')
		
		initPromptTools(server)
		addMcpBreadcrumb('Prompt tools initialized', 'server.init')
		
		if (transaction) {
			transaction.setStatus('ok')
			transaction.finish()
		}
	} catch (error) {
		if (transaction) {
			transaction.setStatus('internal_error')
			transaction.finish()
		}
		captureMcpError(error as Error, { context: 'server_initialization' })
		throw error
	}
}

async function main() {
	const transaction = startMcpTransaction('mcp_server_main', 'mcp.server.main')
	
	try {
		addMcpBreadcrumb('Starting MCP server', 'server.start')
		
		// Initialize server components
		await initializeServerComponents()
		
		// Create transport and connect
		const transport = new StdioServerTransport()
		await server.connect(transport)
		
		addMcpBreadcrumb('MCP server connected successfully', 'server.connected')
		console.error('epicshop MCP Server running on stdio')
		
		if (transaction) {
			transaction.setStatus('ok')
			transaction.finish()
		}
	} catch (error) {
		if (transaction) {
			transaction.setStatus('internal_error')
			transaction.finish()
		}
		
		const errorObj = error as Error
		captureMcpError(errorObj, { context: 'main_function' })
		console.error('Fatal error in main():', errorObj)
		process.exit(1)
	}
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
	captureMcpError(error, { context: 'uncaught_exception' })
	console.error('Uncaught Exception:', error)
	process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
	const error = reason instanceof Error ? reason : new Error(String(reason))
	captureMcpError(error, { context: 'unhandled_rejection', promise: promise.toString() })
	console.error('Unhandled Rejection at:', promise, 'reason:', reason)
	process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', () => {
	addMcpBreadcrumb('Received SIGTERM, shutting down gracefully', 'server.shutdown')
	process.exit(0)
})

process.on('SIGINT', () => {
	addMcpBreadcrumb('Received SIGINT, shutting down gracefully', 'server.shutdown')
	process.exit(0)
})

main().catch((error) => {
	captureMcpError(error as Error, { context: 'main_catch' })
	console.error('Fatal error in main():', error)
	process.exit(1)
})
