import fs from 'node:fs/promises'
import path from 'node:path'
import { init as initApps } from '@epic-web/workshop-utils/apps.server'
import { type z } from 'zod'

export async function handleWorkshopDirectory(workshopDirectory: string) {
	if (workshopDirectory.endsWith('playground')) {
		workshopDirectory = path.join(workshopDirectory, '..')
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
