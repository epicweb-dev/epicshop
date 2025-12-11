import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { resolvePrimaryDir } from './data-storage.server.js'

const WORKSHOPS_FILE = 'workshops.json'

const WorkshopSchema = z.object({
	id: z.string(),
	name: z.string(),
	repoName: z.string(),
	path: z.string(),
	addedAt: z.string(),
})

const WorkshopsDataSchema = z.object({
	reposDirectory: z.string().optional(),
	workshops: z.array(WorkshopSchema).default([]),
})

export type Workshop = z.infer<typeof WorkshopSchema>
export type WorkshopsData = z.infer<typeof WorkshopsDataSchema>

function getDefaultReposDirectory(): string {
	return path.join(os.homedir(), 'epicweb-workshops')
}

function resolveWorkshopsPath(): string {
	return path.join(resolvePrimaryDir(), WORKSHOPS_FILE)
}

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	} catch {}
	try {
		await fs.chmod(dir, 0o700)
	} catch {}
}

async function atomicWriteJSON(filePath: string, data: unknown) {
	const dir = path.dirname(filePath)
	await ensureDir(dir)
	const tmp = path.join(dir, `.tmp-${randomUUID()}`)
	await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
	await fs.rename(tmp, filePath)
}

export async function loadWorkshopsData(): Promise<WorkshopsData> {
	const workshopsPath = resolveWorkshopsPath()
	try {
		const txt = await fs.readFile(workshopsPath, 'utf8')
		const data = JSON.parse(txt)
		return WorkshopsDataSchema.parse(data)
	} catch {
		return { workshops: [] }
	}
}

export async function saveWorkshopsData(data: WorkshopsData): Promise<void> {
	const workshopsPath = resolveWorkshopsPath()
	await atomicWriteJSON(workshopsPath, data)
}

export async function getReposDirectory(): Promise<string> {
	const data = await loadWorkshopsData()
	return data.reposDirectory || getDefaultReposDirectory()
}

export async function setReposDirectory(directory: string): Promise<void> {
	const data = await loadWorkshopsData()
	data.reposDirectory = path.resolve(directory)
	await saveWorkshopsData(data)
}

export async function listWorkshops(): Promise<Workshop[]> {
	const data = await loadWorkshopsData()
	return data.workshops
}

export async function getWorkshop(
	idOrName: string,
): Promise<Workshop | undefined> {
	const workshops = await listWorkshops()
	return workshops.find(
		(w) =>
			w.id === idOrName ||
			w.name.toLowerCase() === idOrName.toLowerCase() ||
			w.repoName.toLowerCase() === idOrName.toLowerCase(),
	)
}

export async function addWorkshop(
	workshop: Omit<Workshop, 'id' | 'addedAt'>,
): Promise<Workshop> {
	const data = await loadWorkshopsData()

	// Check if workshop already exists
	const existing = data.workshops.find(
		(w) =>
			w.repoName.toLowerCase() === workshop.repoName.toLowerCase() ||
			w.path === workshop.path,
	)
	if (existing) {
		throw new Error(
			`Workshop "${workshop.repoName}" already exists at ${existing.path}`,
		)
	}

	const newWorkshop: Workshop = {
		...workshop,
		id: randomUUID(),
		addedAt: new Date().toISOString(),
	}

	data.workshops.push(newWorkshop)
	await saveWorkshopsData(data)
	return newWorkshop
}

export async function removeWorkshop(idOrName: string): Promise<boolean> {
	const data = await loadWorkshopsData()
	const initialLength = data.workshops.length

	data.workshops = data.workshops.filter(
		(w) =>
			w.id !== idOrName &&
			w.name.toLowerCase() !== idOrName.toLowerCase() &&
			w.repoName.toLowerCase() !== idOrName.toLowerCase(),
	)

	if (data.workshops.length < initialLength) {
		await saveWorkshopsData(data)
		return true
	}
	return false
}

export async function workshopExists(repoName: string): Promise<boolean> {
	const workshops = await listWorkshops()
	return workshops.some(
		(w) => w.repoName.toLowerCase() === repoName.toLowerCase(),
	)
}

export async function getWorkshopByPath(
	workshopPath: string,
): Promise<Workshop | undefined> {
	const workshops = await listWorkshops()
	const resolvedPath = path.resolve(workshopPath)
	return workshops.find((w) => path.resolve(w.path) === resolvedPath)
}
