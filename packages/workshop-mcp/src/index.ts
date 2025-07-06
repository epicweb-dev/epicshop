#!/usr/bin/env node

import { exec } from 'child_process'
import { promisify } from 'util'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const execAsync = promisify(exec)

// Create server instance
const server = new McpServer(
	{
		name: 'epicshop',
		version: '1.0.0',
		capabilities: {
			tools: {},
			resources: {},
			prompts: {},
		},
	},
	{
		instructions: `
This is intended to be used within a workshop using the Epic Workshop App
(@epic-web/workshop-app) to help learners in the process of completing the
workshop exercises and understanding the learning outcomes.

The user's work in progress is in the \`playground\` directory. Any changes they
ask you to make should be in this directory.

This MCP server is now a thin wrapper around the epicshop CLI. All functionality
has been moved to the CLI for better maintainability and consistency.
		`.trim(),
	},
)

// Helper function to get the workshop directory
function getWorkshopDirectory(): string {
	// Try to get from environment or use current working directory
	return process.env.EPICSHOP_CONTEXT_CWD || process.cwd()
}

// Helper function to execute CLI commands
async function executeCLI(command: string, args: string[] = []): Promise<any> {
	const workshopDir = getWorkshopDirectory()
	const fullCommand = `epicshop ${command} --workshop-dir="${workshopDir}" --format=json ${args.join(' ')}`
	
	try {
		const { stdout, stderr } = await execAsync(fullCommand)
		if (stderr) {
			console.error('CLI stderr:', stderr)
		}
		
		// Try to parse JSON output
		try {
			return JSON.parse(stdout)
		} catch {
			// If not JSON, return as text
			return stdout.trim()
		}
	} catch (error) {
		throw new Error(`CLI command failed: ${error}`)
	}
}

// Tools
server.tool(
	'login',
	'Allow the user to login (or sign up) to the workshop',
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const result = await executeCLI('login', workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : [])
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result),
					},
				],
			}
		} catch (error) {
			throw new Error(`Login failed: ${error}`)
		}
	},
)

server.tool(
	'logout',
	'Allow the user to logout of the workshop and delete cache data',
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const result = await executeCLI('logout', workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : [])
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result),
					},
				],
			}
		} catch (error) {
			throw new Error(`Logout failed: ${error}`)
		}
	},
)

server.tool(
	'set_playground',
	`
Sets the playground environment so the user can continue to that exercise or see
what that step looks like in their playground environment.

NOTE: this will override their current exercise step work in the playground!

Generally, it is better to not provide an exerciseNumber, stepNumber, and type
and let the user continue to the next exercise. Only provide these arguments if
the user explicitly asks to go to a specific exercise or step.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
		exerciseNumber: z.coerce.number().optional(),
		stepNumber: z.coerce.number().optional(),
		type: z.enum(['problem', 'solution']).optional(),
	},
	async ({ workshopDirectory, exerciseNumber, stepNumber, type }) => {
		try {
			const args = []
			if (workshopDirectory) args.push(`--workshop-dir="${workshopDirectory}"`)
			if (exerciseNumber) args.push(`--exercise=${exerciseNumber}`)
			if (stepNumber) args.push(`--step=${stepNumber}`)
			if (type) args.push(`--type=${type}`)
			
			const result = await executeCLI('set-playground', args)
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result),
					},
				],
			}
		} catch (error) {
			throw new Error(`Set playground failed: ${error}`)
		}
	},
)

server.tool(
	'update_progress',
	`
Intended to help you mark an Epic lesson as complete or incomplete.

This will mark the Epic lesson as complete or incomplete and update the user's progress.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
		epicLessonSlug: z.string(),
		complete: z.boolean().optional().default(true),
	},
	async ({ workshopDirectory, epicLessonSlug, complete }) => {
		try {
			const args = [`--lesson-slug="${epicLessonSlug}"`]
			if (workshopDirectory) args.push(`--workshop-dir="${workshopDirectory}"`)
			if (complete !== undefined) args.push(`--complete=${complete}`)
			
			const result = await executeCLI('update-progress', args)
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result),
					},
				],
			}
		} catch (error) {
			throw new Error(`Update progress failed: ${error}`)
		}
	},
)

// Resource Tools
server.tool(
	'get_workshop_context',
	`
Intended to help you get wholistic context of the topics covered in this
workshop. This doesn't go into as much detail per exercise as the
\`get_exercise_context\` tool, but it is a good starting point to orient
yourself on the workshop as a whole.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const args = workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : []
			const result = await executeCLI('get-workshop-context', args)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get workshop context failed: ${error}`)
		}
	},
)

server.tool(
	'get_exercise_context',
	`
Intended to help a student understand what they need to do for the current
exercise step.

This returns the instructions MDX content for the current exercise and each
exercise step. If the user has the paid version of the workshop, it will also
include the transcript from each of the videos as well.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
		exerciseNumber: z.coerce.number().optional(),
	},
	async ({ workshopDirectory, exerciseNumber }) => {
		try {
			const args = []
			if (workshopDirectory) args.push(`--workshop-dir="${workshopDirectory}"`)
			if (exerciseNumber) args.push(`--exercise=${exerciseNumber}`)
			
			const result = await executeCLI('get-exercise-context', args)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get exercise context failed: ${error}`)
		}
	},
)

server.tool(
	'get_diff_between_apps',
	`
Intended to give context about the changes between two apps.

The output is a git diff of the playground directory as BASE (their work in
progress) against the solution directory as HEAD (the final state they're trying
to achieve).

App IDs are formatted as \`{exerciseNumber}.{stepNumber}.{type}\`.
	`,
	{
		workshopDirectory: z.string().optional(),
		app1: z.string(),
		app2: z.string(),
	},
	async ({ workshopDirectory, app1, app2 }) => {
		try {
			const args = [`--app1="${app1}"`, `--app2="${app2}"`]
			if (workshopDirectory) args.push(`--workshop-dir="${workshopDirectory}"`)
			
			const result = await executeCLI('get-diff', args)
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get diff between apps failed: ${error}`)
		}
	},
)

server.tool(
	'get_exercise_step_progress_diff',
	`
Intended to help a student understand what work they still have to complete.

This is not a typical diff. It's a diff of the user's work in progress against
the solution.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const args = workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : []
			const result = await executeCLI('get-progress-diff', args)
			return {
				content: [
					{
						type: 'text',
						text: typeof result === 'string' ? result : JSON.stringify(result),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get exercise step progress diff failed: ${error}`)
		}
	},
)

server.tool(
	'get_user_info',
	`
Intended to help you get information about the current user.

This includes the user's name, email, etc. It's mostly useful to determine
whether the user is logged in and know who they are.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const args = workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : []
			const result = await executeCLI('get-user-info', args)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get user info failed: ${error}`)
		}
	},
)

server.tool(
	'get_user_access',
	`
Intended to help you get information about the current user's access level.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const args = workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : []
			const result = await executeCLI('get-user-access', args)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get user access failed: ${error}`)
		}
	},
)

server.tool(
	'get_user_progress',
	`
Intended to help you get information about the current user's progress.
	`.trim(),
	{
		workshopDirectory: z.string().optional(),
	},
	async ({ workshopDirectory }) => {
		try {
			const args = workshopDirectory ? [`--workshop-dir="${workshopDirectory}"`] : []
			const result = await executeCLI('get-user-progress', args)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			}
		} catch (error) {
			throw new Error(`Get user progress failed: ${error}`)
		}
	},
)

// Prompts
server.prompt(
	'quiz_me',
	'Have the LLM quiz you on topics from the workshop exercises',
	{
		workshopDirectory: z.string().optional(),
		exerciseNumber: z.string().optional(),
	},
	async ({ workshopDirectory, exerciseNumber }) => {
		try {
			const args = []
			if (workshopDirectory) args.push(`--workshop-dir="${workshopDirectory}"`)
			if (exerciseNumber) args.push(`--exercise="${exerciseNumber}"`)
			
			const result = await executeCLI('quiz-me', args)
			
			return {
				messages: [
					{
						role: 'user',
						content: {
							type: 'text',
							text: result.prompt || JSON.stringify(result, null, 2),
						},
					},
				],
			}
		} catch (error) {
			throw new Error(`Quiz me failed: ${error}`)
		}
	},
)

async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error('epicshop MCP Server running on stdio (now wrapping CLI)')
}

main().catch((error) => {
	console.error('Fatal error in main():', error)
	process.exit(1)
})
