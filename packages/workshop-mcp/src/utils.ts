import fs from 'node:fs/promises'
import path from 'node:path'
import { init as initApps } from '@epic-web/workshop-utils/apps.server'
import { z } from 'zod'

export const workshopDirectoryInputSchema = z
	.string()
	.describe(
		'The workshop directory (the root directory of the workshop repo). This should be an absolute path.',
	)

async function isWorkshopDirectory(workshopDirectory: string) {
	console.error('isWorkshopDirectory', workshopDirectory)
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
	console.error('isWorkshopDirectory', Boolean(pkgJson.epicshop))

	return Boolean(pkgJson.epicshop)
}

export async function handleWorkshopDirectory(workshopDirectory: string) {
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
