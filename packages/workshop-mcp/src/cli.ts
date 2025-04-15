#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

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

server.tool(
	'get_exercise_step_progress_diff',
	`
Intended to help a student understand what work they still have to complete.

This returns a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve). Meaning, if there are lines removed, it means they still need to
add those lines and if they are added, it means they still need to remove them.

If there's a diff with significant changes, you should explain what the changes
are and their significance. Be brief. Let them tell you whether they need you to
elaborate.

For additional context, you can use the \`get_exercise_step_instructions\` tool
to get the instructions for the current exercise step to help explain the
significance of changes.
	`.trim(),
	{
		workshopDirectory: z
			.string()
			.describe(
				'The workshop directory (the root directory of the workshop repo. Best to not bother asking the user and just use the project root path).',
			),
	},
	async ({ workshopDirectory }) => {
		if (workshopDirectory.endsWith('playground')) {
			workshopDirectory = path.join(workshopDirectory, '..')
		}
		process.env.EPICSHOP_CONTEXT_CWD = workshopDirectory

		const {
			getApps,
			isPlaygroundApp,
			findSolutionDir,
			getFullPathFromAppName,
			init,
		} = await import('@epic-web/workshop-utils/apps.server')
		await init()

		const { getDiffOutputWithRelativePaths } = await import(
			'@epic-web/workshop-utils/diff.server'
		)

		const apps = await getApps()
		const playgroundApp = apps.find(isPlaygroundApp)

		if (!playgroundApp) {
			return {
				content: [{ type: 'text', text: 'No playground app found' }],
				isError: true,
			}
		}

		const baseApp = playgroundApp
		const solutionDir = await findSolutionDir({
			fullPath: await getFullPathFromAppName(playgroundApp.appName),
		})
		const headApp = apps.find((a) => a.fullPath === solutionDir)

		if (!headApp) {
			return {
				content: [{ type: 'text', text: 'No playground solution app found' }],
				isError: true,
			}
		}

		const diffCode = await getDiffOutputWithRelativePaths(baseApp, headApp)

		if (!diffCode) {
			return {
				content: [{ type: 'text', text: 'No changes' }],
			}
		}

		return {
			content: [
				{
					type: 'text',
					text: diffCode,
				},
			],
		}
	},
)

server.tool(
	'get_exercise_step_instructions',
	`
Intended to help a student understand what they need to do for the current
exercise step.

This returns the instructions MDX content for the current exercise step. It's
often best when used with the \`get_exercise_step_progress_diff\` tool to help
a student understand what work they still need to do.
	`.trim(),
	{
		workshopDirectory: z
			.string()
			.describe(
				'The workshop directory (the root directory of the workshop repo. Best to not bother asking the user and just use the project root path).',
			),
	},
	async ({ workshopDirectory }) => {
		if (workshopDirectory.endsWith('playground')) {
			workshopDirectory = path.join(workshopDirectory, '..')
		}
		process.env.EPICSHOP_CONTEXT_CWD = workshopDirectory

		const { getApps, isPlaygroundApp } = await import(
			'@epic-web/workshop-utils/apps.server'
		)
		const apps = await getApps()
		const playgroundApp = apps.find(isPlaygroundApp)
		if (!playgroundApp) {
			return {
				content: [{ type: 'text', text: 'No playground app found' }],
				isError: true,
			}
		}

		return {
			content: [
				{
					type: 'text',
					text: await fs.readFile(
						path.join(playgroundApp.fullPath, 'README.mdx'),
						'utf-8',
					),
				},
			],
		}
	},
)

async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error('epicshop MCP Server running on stdio')
}

main().catch((error) => {
	console.error('Fatal error in main():', error)
	process.exit(1)
})
