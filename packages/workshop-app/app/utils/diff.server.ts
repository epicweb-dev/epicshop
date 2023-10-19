// import { exec } from 'child_process'
import os from 'os'
import path from 'path'
import { type CacheEntry } from 'cachified'
import { execa } from 'execa'
import fsExtra from 'fs-extra'
import { isGitIgnored } from 'globby'
import parseGitDiff, { type AnyFileChange } from 'parse-git-diff'
import { BUNDLED_LANGUAGES } from 'shiki'
import {
	getForceFreshForDir,
	getRelativePath,
	getWorkshopRoot,
	modifiedTimes,
	type App,
} from './apps.server.ts'
import { diffCodeCache, diffFilesCache, cachified } from './cache.server.ts'
import { compileMarkdownString } from './compile-mdx.server.ts'
import { type Timings } from './timing.server.ts'

const kcdshopTempDir = path.join(os.tmpdir(), 'kcdshop')

const isDeployed = ENV.KCDSHOP_DEPLOYED

const diffTmpDir = path.join(kcdshopTempDir, 'diff')

function diffPathToRelative(filePath: string) {
	if (filePath.startsWith('"a/') || filePath.startsWith('"b/')) {
		filePath = filePath.slice(3)
	}
	const normalizedPath = path.normalize(filePath).replace(/^("|')|("|')$/g, '')

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [workshopRootDirname, appId, id, ...relativePath] = normalizedPath
		.replace(
			process.platform === 'win32' || normalizedPath.startsWith(path.sep)
				? `${diffTmpDir}${path.sep}`
				: `${diffTmpDir.slice(1)}${path.sep}`,
			'',
		)
		.split(path.sep)

	return relativePath.join(path.sep)
}

function getLanguage(ext: string) {
	return (
		BUNDLED_LANGUAGES.find(l => l.id === ext || l.aliases?.includes(ext))?.id ??
		'text'
	)
}

function getFileCodeblocks(
	file: ReturnType<typeof parseGitDiff>['files'][number],
	filePathApp1: string,
	filePathApp2: string,
	type: string,
) {
	if (!file.chunks.length) {
		return [`No changes`]
	}
	const filepath = diffPathToRelative(
		file.type === 'RenamedFile' ? file.pathAfter : file.path,
	)
	const extension = path.extname(filepath).slice(1)
	const lang = getLanguage(extension)
	const pathToCopy = file.type === 'RenamedFile' ? file.pathBefore : file.path
	const relativePath = diffPathToRelative(pathToCopy)
	const markdownLines = []
	for (const chunk of file.chunks) {
		const removedLineNumbers = []
		const addedLineNumbers = []
		const lines = []
		let toStartLine = 0
		let startLine = 1
		if (chunk.type === 'BinaryFilesChunk') {
			lines.push(
				type === 'AddedFile'
					? `Binary file added`
					: type === 'DeletedFile'
					? 'Binary file deleted'
					: 'Binary file changed',
			)
		} else {
			startLine =
				chunk.type === 'Chunk'
					? chunk.fromFileRange.start
					: chunk.type === 'CombinedChunk'
					? chunk.fromFileRangeA.start
					: 1
			toStartLine = chunk.toFileRange.start
			for (
				let lineNumber = 0;
				lineNumber < chunk.changes.length;
				lineNumber++
			) {
				const change = chunk.changes[lineNumber]
				if (!change) continue
				lines.push(change.content)
				switch (change.type) {
					case 'AddedLine': {
						addedLineNumbers.push(startLine + lineNumber)
						break
					}
					case 'DeletedLine': {
						removedLineNumbers.push(startLine + lineNumber)
						break
					}
				}
			}
		}

		const params = [
			['filename', relativePath.replace(/\\/g, '\\\\')],
			['start', startLine.toString()],
			removedLineNumbers.length
				? ['remove', removedLineNumbers.join(',')]
				: null,
			addedLineNumbers.length ? ['add', addedLineNumbers.join(',')] : null,
		]
			.filter(Boolean)
			.map(([key, value]) => `${key}=${value}`)
			.join(' ')

		const launchEditorClassName =
			'border border-border hover:bg-foreground/20 rounded px-2 py-0.5 font-mono text-xs font-semibold'
		function launchEditor(appNum: number, line: number) {
			if (isDeployed) {
				if (type === 'DeletedFile' && appNum === 2) return ''
				if (type === 'AddedFile' && appNum === 1) return ''
			}

			const label =
				(type === 'AddedFile' && appNum === 1) ||
				(type === 'DeletedFile' && appNum === 2)
					? `CREATE in APP ${appNum}`
					: `OPEN in APP ${appNum}`
			const file = JSON.stringify(appNum === 1 ? filePathApp1 : filePathApp2)
			const fixedTitle = getRelativePath(file)

			return `
<LaunchEditor file=${file} line={${line}}>
	<span title=${fixedTitle} className="${launchEditorClassName}">${label}</span>
</LaunchEditor>`
		}

		markdownLines.push(`
<div className="relative">

\`\`\`${lang} ${params}
${lines.join('\n')}
\`\`\`

<div className="flex gap-4 absolute top-1 right-3 items-center">
	${launchEditor(1, startLine)}
	<div className="display-alt-down flex gap-2">
		<LaunchEditor file=${JSON.stringify(
			filePathApp1,
		)} syncTo={{file: ${JSON.stringify(filePathApp2)}}}>
			<span className="block ${launchEditorClassName}">
				<Icon name="ArrowLeft" title="Copy app 2 file to app 1" />
			</span>
		</LaunchEditor>
		<LaunchEditor file=${JSON.stringify(
			filePathApp2,
		)} syncTo={{file: ${JSON.stringify(filePathApp1)}}}>
			<span className="block ${launchEditorClassName}">
				<Icon name="ArrowRight" title="Copy app 1 file to app 2" />
			</span>
		</LaunchEditor>
	</div>
	${launchEditor(2, toStartLine)}
</div>

</div>
`)
	}
	return markdownLines
}

const EXTRA_FILES_TO_IGNORE = [
	/README(\.\d+)?\.mdx?$/,
	/package-lock\.json$/,
	/\.DS_Store$/,
	/\.vscode$/,
	/\.idea$/,
	/\.git$/,
	/\.db$/,
	/\/kcdshop\//,
	/\\kcdshop\\/,
]

async function copyUnignoredFiles(
	srcDir: string,
	destDir: string,
	ignore: Array<string>,
) {
	const key = `COPY_${srcDir}__${destDir}__${ignore.join('_')}`
	await cachified({
		key,
		cache: diffCodeCache,
		forceFresh: getForceFreshForDir(srcDir, await diffCodeCache.get(key)),
		async getFreshValue() {
			const isIgnored = await isGitIgnored({ cwd: srcDir })

			await fsExtra.remove(destDir)
			await fsExtra.copy(srcDir, destDir, {
				filter: async file => {
					if (file === srcDir) return true
					const shouldCopy =
						!isIgnored(file) &&
						![...ignore, ...EXTRA_FILES_TO_IGNORE].some(f =>
							typeof f === 'string' ? file.includes(f) : f.test(file),
						)
					return shouldCopy
				},
			})
		},
	})
}

async function prepareForDiff(app1: App, app2: App) {
	const workshopRoot = getWorkshopRoot()
	const id = Math.random().toString(36).slice(2)
	const app1CopyPath = path.join(
		diffTmpDir,
		path.basename(workshopRoot),
		app1.name,
		id,
	)
	const app2CopyPath = path.join(
		diffTmpDir,
		path.basename(workshopRoot),
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
			? await fsExtra.readJSON(path.join(app1.fullPath, 'package.json'))
			: {}
	const app2PkgJson =
		app1.dev.type === 'script'
			? await fsExtra.readJSON(path.join(app2.fullPath, 'package.json'))
			: {}
	const ignore = comparePkgJson(app1PkgJson, app2PkgJson)
		? ['package.json']
		: []

	await Promise.all([
		copyUnignoredFiles(app1.fullPath, app1CopyPath, ignore),
		copyUnignoredFiles(app2.fullPath, app2CopyPath, ignore),
	])

	return { app1CopyPath, app2CopyPath }
}

function getForceFreshForDiff(
	app1: App,
	app2: App,
	cacheEntry: CacheEntry | null | undefined,
) {
	if (!cacheEntry) return true
	const app1Modified = modifiedTimes.get(app1.fullPath) ?? 0
	const app2Modified = modifiedTimes.get(app2.fullPath) ?? 0
	const cacheModified = cacheEntry.metadata.createdTime
	return (
		!cacheModified ||
		app1Modified > cacheModified ||
		app2Modified > cacheModified ||
		undefined
	)
}

export async function getDiffFiles(
	app1: App,
	app2: App,
	{
		forceFresh = false,
		timings,
		request,
	}: { forceFresh?: boolean; timings?: Timings; request?: Request } = {},
) {
	const key = `${app1.relativePath}__vs__${app2.relativePath}`
	const cacheEntry = await diffFilesCache.get(key)
	const result = await cachified({
		key,
		cache: diffFilesCache,
		forceFresh: forceFresh || getForceFreshForDiff(app1, app2, cacheEntry),
		timings,
		request,
		getFreshValue: () => getDiffFilesImpl(app1, app2),
	})
	return result
}

function getAppTestFiles(app: App) {
	return app.test.type === 'browser' ? app.test.testFiles : []
}

export async function getDiffFilesImpl(app1: App, app2: App) {
	if (app1.name === app2.name) {
		return []
	}
	const { app1CopyPath, app2CopyPath } = await prepareForDiff(app1, app2)

	const { stdout: diffOutput } = await execa(
		'git',
		['diff', '--no-index', '--ignore-blank-lines', app1CopyPath, app2CopyPath],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to ignore the error
	).catch(e => e)

	void fsExtra.remove(app1CopyPath)
	void fsExtra.remove(app2CopyPath)

	const typesMap = {
		ChangedFile: 'modified',
		AddedFile: 'added',
		DeletedFile: 'deleted',
		RenamedFile: 'renamed',
	}

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
		.map(file => ({
			// prettier-ignore
			status: (typesMap[file.type] ?? 'unknown') as 'renamed' | 'modified' | 'deleted' | 'added' | 'unknown',
			path: diffPathToRelative(
				file.type === 'RenamedFile' ? file.pathBefore : file.path,
			),
			line: startLine(file),
		}))
		.filter(file => !testFiles.includes(file.path))
}

export async function getDiffCode(
	app1: App,
	app2: App,
	{
		forceFresh = false,
		timings,
		request,
	}: { forceFresh?: boolean; timings?: Timings; request?: Request } = {},
) {
	const key = `${app1.relativePath}__vs__${app2.relativePath}`
	const cacheEntry = await diffCodeCache.get(key)
	const result = await cachified({
		key,
		cache: diffCodeCache,
		forceFresh: forceFresh || getForceFreshForDiff(app1, app2, cacheEntry),
		timings,
		request,
		getFreshValue: () => getDiffCodeImpl(app1, app2),
	})
	return result
}

async function getDiffCodeImpl(app1: App, app2: App) {
	let markdownLines = ['']

	if (app1.name === app2.name) {
		markdownLines.push(
			'<p className="p-4 text-center">You are comparing the same app</p>',
		)
		const code = await compileMarkdownString(markdownLines.join('\n'))
		return code
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
			'--no-prefix',
			'--ignore-blank-lines',
		],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to ignore the error
	).catch(e => e)

	void fsExtra.remove(app1CopyPath)
	void fsExtra.remove(app2CopyPath)

	const parsed = parseGitDiff(diffOutput)

	if (!parsed.files.length) {
		markdownLines.push(
			'<div className="m-5 inline-flex items-center justify-center bg-foreground px-1 py-0.5 font-mono text-sm uppercase text-background">No changes</div>',
		)
	}

	const app1TestFiles = getAppTestFiles(app1)
	const app2TestFiles = getAppTestFiles(app2)

	for (const file of parsed.files) {
		const pathToCopy = file.type === 'RenamedFile' ? file.pathBefore : file.path
		const relativePath = diffPathToRelative(pathToCopy)
		if (app1TestFiles.includes(relativePath)) continue
		const filePathApp1 = path.join(app1.fullPath, relativePath)

		const pathToApp2 = file.type === 'RenamedFile' ? file.pathAfter : file.path
		const relativePathApp2 = diffPathToRelative(pathToApp2)
		if (app2TestFiles.includes(relativePathApp2)) continue
		const filePathApp2 = path.join(app2.fullPath, relativePathApp2)

		switch (file.type) {
			case 'ChangedFile': {
				markdownLines.push(`

<Accordion title=${JSON.stringify(relativePath)} variant="changed">

${getFileCodeblocks(file, filePathApp1, filePathApp2, file.type).join('\n')}

</Accordion>

`)
				break
			}
			case 'DeletedFile': {
				markdownLines.push(`
<Accordion title=${JSON.stringify(relativePath)} variant="deleted">

${getFileCodeblocks(file, filePathApp1, filePathApp2, file.type).join('\n')}

</Accordion>
`)
				break
			}
			case 'RenamedFile': {
				const relativeBefore = diffPathToRelative(file.pathBefore)
				const relativeAfter = diffPathToRelative(file.pathAfter)
				const title = JSON.stringify(`${relativeBefore} ▶️ ${relativeAfter}`)
				markdownLines.push(`
<Accordion title=${title} variant="renamed">

${getFileCodeblocks(file, filePathApp1, filePathApp2, file.type).join('\n')}

</Accordion>
`)
				break
			}
			case 'AddedFile': {
				markdownLines.push(`
<Accordion title=${JSON.stringify(relativePath)} variant="added">

${getFileCodeblocks(file, filePathApp1, filePathApp2, file.type).join('\n')}

</Accordion>
`)
				break
			}
			default: {
				console.error(file)
				throw new Error(`Unknown file type: ${file}`)
			}
		}
	}

	const code = await compileMarkdownString(markdownLines.join('\n'))
	return code
}
