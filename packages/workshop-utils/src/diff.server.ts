import os from 'os'
import path from 'path'
import { type CacheEntry } from '@epic-web/cachified'
import { execa } from 'execa'
import fsExtra from 'fs-extra'
import ignore from 'ignore'
import parseGitDiff, { type AnyFileChange } from 'parse-git-diff'
import { z } from 'zod'
import {
	getForceFreshForDir,
	getWorkshopRoot,
	modifiedTimes,
	type App,
} from './apps.server.ts'
import {
	cachified,
	copyUnignoredFilesCache,
	diffFilesCache,
	diffPatchCache,
} from './cache.server.ts'
import { modifiedMoreRecentlyThan } from './modified-time.server.ts'
import { type Timings } from './timing.server.ts'

const epicshopTempDir = path.join(os.tmpdir(), 'epicshop')

const diffTmpDir = path.join(epicshopTempDir, 'diff')
const DiffStatusSchema = z.enum([
	'renamed',
	'modified',
	'deleted',
	'added',
	'unknown',
])
const DiffFileSchema = z.object({
	status: DiffStatusSchema,
	path: z.string(),
	line: z.number(),
})
type DiffStatus = z.infer<typeof DiffStatusSchema>
type DiffFile = z.infer<typeof DiffFileSchema>

function getDiffStatus(fileType: AnyFileChange['type']): DiffStatus {
	switch (fileType) {
		case 'ChangedFile': {
			return 'modified'
		}
		case 'AddedFile': {
			return 'added'
		}
		case 'DeletedFile': {
			return 'deleted'
		}
		case 'RenamedFile': {
			return 'renamed'
		}
		default: {
			return 'unknown'
		}
	}
}

/**
 * Converts a diff file path to a relative path for display and lookup.
 * - Removes leading/trailing quotes.
 * - Strips diff prefixes like a/, b/, .\a\, .\b\, ./a/, ./b/ (for both POSIX and Windows).
 * - Normalizes the path separators.
 * - Removes the diff temp directory prefix and splits out the actual relative path.
 */
function diffPathToRelative(filePath: string) {
	let normalizedPath = path.normalize(
		filePath
			.replace(/^["']|["']$/g, '')
			.replace(/^(\.\\[ab]\\|\.\/[ab]\/|[ab][\\/])/, ''),
	)

	const relativePath = normalizedPath
		.replace(
			process.platform === 'win32' || normalizedPath.startsWith(path.sep)
				? `${diffTmpDir}${path.sep}`
				: `${diffTmpDir.slice(1)}${path.sep}`,
			'',
		)
		.split(path.sep)
		.slice(3)

	return relativePath.join(path.sep)
}

const DEFAULT_IGNORE_PATTERNS = [
	'**/README.*',
	'**/package-lock.json',
	'**/.DS_Store',
	'**/.vscode',
	'**/.idea',
	'**/.git',
	'**/*.db',
	'**/epicshop/**',
]

async function copyUnignoredFiles(
	srcDir: string,
	destDir: string,
	ignoreList: Array<string>,
) {
	const key = `COPY_${srcDir}__${destDir}__${ignoreList.join('_')}`
	await cachified({
		key,
		cache: copyUnignoredFilesCache,
		checkValue: z.boolean(),
		forceFresh: await getForceFreshForDir(
			copyUnignoredFilesCache.get(key),
			srcDir,
		),
		async getFreshValue() {
			// @ts-ignore 🤷‍♂️ weird module stuff
			const ig = ignore().add(ignoreList)

			await fsExtra.remove(destDir)
			await fsExtra.copy(srcDir, destDir, {
				filter: async (file) => {
					if (file === srcDir) return true
					return !ig.ignores(path.relative(srcDir, file))
				},
			})
			return true
		},
	})
}

async function prepareForDiff(app1: App, app2: App) {
	const id = Math.random().toString(36).slice(2)
	const app1CopyPath = path.join(
		diffTmpDir,
		path.basename(getWorkshopRoot()),
		app1.name,
		id,
	)
	const app2CopyPath = path.join(
		diffTmpDir,
		path.basename(getWorkshopRoot()),
		app2.name,
		id,
	)
	// if everything except the `name` property of the `package.json` is the same
	// the don't bother copying it
	const comparePkgJson = (pkg1: any, pkg2: any) => {
		const { name, ...rest1 } = pkg1
		const { name: name2, ...rest2 } = pkg2
		return JSON.stringify(rest1) === JSON.stringify(rest2)
	}
	const app1PkgJson =
		app1.dev.type === 'script'
			? await fsExtra
					.readJSON(path.join(app1.fullPath, 'package.json'))
					.catch(() => ({}))
			: {}
	const app2PkgJson =
		app1.dev.type === 'script'
			? await fsExtra
					.readJSON(path.join(app2.fullPath, 'package.json'))
					.catch(() => ({}))
			: {}
	const pkgJsonIgnore: Array<string> = comparePkgJson(app1PkgJson, app2PkgJson)
		? ['package.json']
		: []
	const workshopIgnore = [
		...(await getDiffIgnore(path.join(getWorkshopRoot(), '.gitignore'))),
		...(await getDiffIgnore(
			path.join(getWorkshopRoot(), 'epicshop', '.diffignore'),
		)),
	]

	await Promise.all([
		copyUnignoredFiles(app1.fullPath, app1CopyPath, [
			...DEFAULT_IGNORE_PATTERNS,
			...pkgJsonIgnore,
			...workshopIgnore,
			...(await getDiffIgnore(path.join(app1.fullPath, '.gitignore'))),
			...(await getDiffIgnore(
				path.join(app1.fullPath, 'epicshop', '.diffignore'),
			)),
		]),
		copyUnignoredFiles(app2.fullPath, app2CopyPath, [
			...DEFAULT_IGNORE_PATTERNS,
			...pkgJsonIgnore,
			...workshopIgnore,
			...(await getDiffIgnore(path.join(app2.fullPath, '.gitignore'))),
			...(await getDiffIgnore(
				path.join(app2.fullPath, 'epicshop', '.diffignore'),
			)),
		]),
	])

	return { app1CopyPath, app2CopyPath }
}

async function getDiffIgnore(filePath: string): Promise<Array<string>> {
	return (await fsExtra.pathExists(filePath))
		? fsExtra.readFile(filePath, 'utf8').then((content) =>
				content
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => !line.startsWith('#'))
					.filter(Boolean),
			)
		: []
}

async function getForceFreshForDiff(
	app1: App,
	app2: App,
	cacheEntry:
		| CacheEntry
		| null
		| undefined
		| Promise<CacheEntry | null | undefined>,
) {
	// don't know when the cache was created? force refresh
	const resolvedCacheEntry = await cacheEntry
	const cacheModified = resolvedCacheEntry?.metadata.createdTime
	if (!cacheModified) return true

	// app1 modified after cache? force refresh
	const app1Modified = modifiedTimes.get(app1.fullPath) ?? 0
	if (app1Modified > cacheModified) return true

	// app2 modified after cache? force refresh
	const app2Modified = modifiedTimes.get(app2.fullPath) ?? 0
	if (app2Modified > cacheModified) return true

	// ok, now let's actually check the modified times of all files in the
	// directories and as soon as we find a file that was modified more recently
	// then we know we need to force refresh
	const modifiedMoreRecently = await modifiedMoreRecentlyThan(
		cacheModified,
		app1.fullPath,
		app2.fullPath,
	)
	if (modifiedMoreRecently) return true

	return undefined
}

export async function getDiffFiles(
	app1: App,
	app2: App,
	{
		forceFresh,
		timings,
		request,
	}: { forceFresh?: boolean; timings?: Timings; request?: Request } = {},
) {
	const key = `${app1.relativePath}__vs__${app2.relativePath}`
	const cacheEntry = await diffFilesCache.get(key)
	const result = await cachified({
		key,
		cache: diffFilesCache,
		forceFresh:
			forceFresh || (await getForceFreshForDiff(app1, app2, cacheEntry)),
		timings,
		request,
		checkValue: DiffFileSchema.array(),
		getFreshValue: () => getDiffFilesImpl(app1, app2),
	})
	return result
}

function getAppTestFiles(app: App) {
	return app.test.type === 'browser' ? app.test.testFiles : []
}

async function getDiffFilesImpl(
	app1: App,
	app2: App,
): Promise<Array<DiffFile>> {
	if (app1.name === app2.name) {
		return []
	}
	const { app1CopyPath, app2CopyPath } = await prepareForDiff(app1, app2)

	const { stdout: diffOutput } = await execa(
		'git',
		[
			'diff',
			'--no-index',
			'--ignore-blank-lines',
			'--ignore-space-change',
			app1CopyPath,
			app2CopyPath,
		],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to use the error output
	).catch((e) => e as { stdout: string })

	void fsExtra.remove(app1CopyPath).catch(() => {})
	void fsExtra.remove(app2CopyPath).catch(() => {})

	const parsed = parseGitDiff(diffOutput, { noPrefix: true })

	const testFiles = Array.from(
		new Set([...getAppTestFiles(app1), ...getAppTestFiles(app2)]),
	)

	const startLine = (file: AnyFileChange) => {
		const chunk = file.type === 'ChangedFile' && file.chunks[0]
		if (chunk) {
			return chunk.type === 'Chunk'
				? chunk.fromFileRange.start
				: chunk.type === 'CombinedChunk'
					? chunk.fromFileRangeA.start
					: 1
		}
		return 1
	}

	return parsed.files
		.map((file) => ({
			status: getDiffStatus(file.type),
			path: diffPathToRelative(
				file.type === 'RenamedFile' ? file.pathBefore : file.path,
			),
			line: startLine(file),
		}))
		.filter((file) => !testFiles.includes(file.path))
}

export async function getDiffPatch(
	app1: App,
	app2: App,
	{
		forceFresh,
		timings,
		request,
	}: { forceFresh?: boolean; timings?: Timings; request?: Request } = {},
) {
	const key = `${app1.relativePath}__vs__${app2.relativePath}`
	const cacheEntry = await diffPatchCache.get(key)
	const result = await cachified({
		key,
		cache: diffPatchCache,
		forceFresh:
			forceFresh || (await getForceFreshForDiff(app1, app2, cacheEntry)),
		timings,
		request,
		checkValue: z.string(),
		getFreshValue: () => getDiffPatchImpl(app1, app2),
	})
	return result
}

async function getDiffPatchImpl(app1: App, app2: App) {
	if (app1.name === app2.name) {
		return ''
	}

	const { app1CopyPath, app2CopyPath } = await prepareForDiff(app1, app2)

	const { stdout: diffOutput } = await execa(
		'git',
		[
			'diff',
			'--no-index',
			app1CopyPath,
			app2CopyPath,
			'--color=never',
			'--color-moved-ws=allow-indentation-change',
			'--ignore-blank-lines',
			'--ignore-space-change',
		],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to use the error output
	).catch((e) => e as { stdout?: string })

	void fsExtra.remove(app1CopyPath).catch(() => {})
	void fsExtra.remove(app2CopyPath).catch(() => {})

	const normalizedOutput = String(diffOutput ?? '')
	const app1Relative = app1CopyPath.slice(1)
	const app2Relative = app2CopyPath.slice(1)

	return normalizedOutput
		.replaceAll(`a${app1CopyPath}`, 'a')
		.replaceAll(`b${app1CopyPath}`, 'b')
		.replaceAll(`a${app2CopyPath}`, 'a')
		.replaceAll(`b${app2CopyPath}`, 'b')
		.replaceAll(`a/${app1Relative}`, 'a')
		.replaceAll(`b/${app1Relative}`, 'b')
		.replaceAll(`a/${app2Relative}`, 'a')
		.replaceAll(`b/${app2Relative}`, 'b')
}

export async function getDiffOutputWithRelativePaths(app1: App, app2: App) {
	const { app1CopyPath, app2CopyPath } = await prepareForDiff(app1, app2)

	const { stdout: diffOutput } = await execa(
		'git',
		[
			'diff',
			'--no-index',
			app1CopyPath,
			app2CopyPath,
			'--color=never',
			'--color-moved-ws=allow-indentation-change',
			'--no-prefix',
			'--ignore-blank-lines',
			'--ignore-space-change',
		],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to use the error output
	).catch((e) => e as { stdout: string })

	void fsExtra.remove(app1CopyPath).catch(() => {})
	void fsExtra.remove(app2CopyPath).catch(() => {})

	return diffOutput
		.replaceAll(app1CopyPath.slice(1), '.')
		.replaceAll(app2CopyPath.slice(1), '.')
}
