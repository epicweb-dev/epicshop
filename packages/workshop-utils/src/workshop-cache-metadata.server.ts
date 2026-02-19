import path from 'path'
import fsExtra from 'fs-extra'
import z from 'zod'

export const WORKSHOP_CACHE_METADATA_FILE_NAME =
	'.workshop-cache-metadata.json' as const

const WorkshopCacheMetadataSchema = z.object({
	schemaVersion: z.literal(1),
	workshopId: z.string().min(1),
	displayName: z.string().min(1),
	repoName: z.string().optional(),
	subtitle: z.string().optional(),
	createdAt: z.number(),
})

export type WorkshopCacheMetadata = z.infer<typeof WorkshopCacheMetadataSchema>

export function getWorkshopCacheMetadataFilePath({
	cacheDir,
	workshopId,
}: {
	cacheDir: string
	workshopId: string
}) {
	return path.join(cacheDir, workshopId, WORKSHOP_CACHE_METADATA_FILE_NAME)
}

async function writeWorkshopCacheMetadataAtomic({
	filePath,
	metadata,
}: {
	filePath: string
	metadata: WorkshopCacheMetadata
}) {
	const tmpPath = `${filePath}.tmp`
	await fsExtra.ensureDir(path.dirname(filePath))
	await fsExtra.writeJSON(tmpPath, metadata, { spaces: 2 })
	await fsExtra.move(tmpPath, filePath, { overwrite: true })
}

export async function readWorkshopCacheMetadataFile({
	cacheDir,
	workshopId,
}: {
	cacheDir: string
	workshopId: string
}): Promise<WorkshopCacheMetadata | null> {
	const filePath = getWorkshopCacheMetadataFilePath({ cacheDir, workshopId })
	try {
		const raw = await fsExtra.readJSON(filePath)
		const parsed = WorkshopCacheMetadataSchema.safeParse(raw)
		return parsed.success ? parsed.data : null
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code === 'ENOENT'
		) {
			return null
		}
		return null
	}
}

export async function ensureWorkshopCacheMetadataFile({
	cacheDir,
	workshopId,
	displayName,
	repoName,
	subtitle,
}: {
	cacheDir: string
	workshopId: string
	displayName: string
	repoName?: string
	subtitle?: string
}): Promise<WorkshopCacheMetadata | null> {
	const filePath = getWorkshopCacheMetadataFilePath({ cacheDir, workshopId })

	// Fast path: already exists and parses.
	const existing = await readWorkshopCacheMetadataFile({ cacheDir, workshopId })
	if (existing) return existing

	const metadata: WorkshopCacheMetadata = {
		schemaVersion: 1,
		workshopId,
		displayName,
		repoName,
		subtitle,
		createdAt: Date.now(),
	}

	try {
		await writeWorkshopCacheMetadataAtomic({ filePath, metadata })
		return metadata
	} catch {
		return null
	}
}

