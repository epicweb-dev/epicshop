import fs from 'node:fs/promises'
import path from 'node:path'
import { init as initApps } from '@epic-web/workshop-utils/apps.server'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AsyncLocalStorage } from 'node:async_hooks'

export const mcpServerStorage = new AsyncLocalStorage<McpServer>()

export function getWorkshopDirectoryInputSchema() {
	const server = mcpServerStorage.getStore()
	if (server?.server.getClientCapabilities()?.roots) {
		return z
			.string()
			.describe(
				'The workshop directory (the root directory of the workshop repo). This should be an absolute path. If not provided, the server will use the first root directory that is a workshop directory.',
			)
			.optional()
	} else {
		return z
			.string()
			.describe(
				'The workshop directory (the root directory of the workshop repo). This should be an absolute path.',
			)
	}
}

async function isWorkshopDirectory(workshopDirectory: string) {
	const packageJson = await safeReadFile(
		path.join(workshopDirectory, 'package.json'),
	)
	if (!packageJson) return false

	let pkgJson: any
	try {
		pkgJson = JSON.parse(packageJson)
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(
				`Syntax error in package.json in "${workshopDirectory}": ${error.message}`,
			)
		}
		throw error
	}

	return Boolean(pkgJson.epicshop)
}

export async function handleWorkshopDirectory(workshopDirectory?: string) {
	if (!workshopDirectory) {
		const server = mcpServerStorage.getStore()
		if (!server) {
			throw new Error('No workshop directory provided and no server found')
		}
		const { roots } = await server.server.listRoots()
		if (roots.length > 0) {
			// find the first root that is a workshop directory
			for (const root of roots) {
				if (root.uri.startsWith('file://')) {
					workshopDirectory = path.resolve(root.uri.slice(7))
					if (await isWorkshopDirectory(workshopDirectory)) {
						return workshopDirectory
					}
				}
			}
		}
		throw new Error(
			'No workshop directory provided and no workshop directory found from the server roots',
		)
	}

	workshopDirectory = workshopDirectory.trim()

	if (!workshopDirectory) throw new Error('The workshop directory is required')

	if (!path.isAbsolute(workshopDirectory)) {
		throw new Error('The workshop directory must be an absolute path')
	}

	if (workshopDirectory.endsWith(`${path.sep}playground`)) {
		workshopDirectory = path.join(workshopDirectory, '..')
	}

	while (true) {
		if (await isWorkshopDirectory(workshopDirectory)) break
		if (workshopDirectory === path.dirname(workshopDirectory)) {
			throw new Error(`No workshop directory found in "${workshopDirectory}"`)
		}
		workshopDirectory = path.dirname(workshopDirectory)
	}

	await initApps(workshopDirectory)
	return workshopDirectory
}

export async function safeReadFile(filePath: string) {
	try {
		return await fs.readFile(filePath, 'utf-8')
	} catch {
		return null
	}
}

export type InputSchemaType<T extends { [K: string]: z.ZodType }> = {
	[K in keyof T]: z.infer<T[K]>
}
