import { cachified } from 'cachified'
import fsExtra from 'fs-extra'
import os from 'os'
import parseGitDiff from 'parse-git-diff'
import path from 'path'
import { BUNDLED_LANGUAGES } from 'shiki'
import { diffCodeCache } from './cache.server'
import { compileMarkdownString } from './compile-mdx.server'
import { typedBoolean } from './misc'
import { getWorkshopRoot, getDirMtimeMs, type App } from './apps.server'

const kcdshopTempDir = path.join(os.tmpdir(), 'kcdshop')

const diffTmpDir = path.join(kcdshopTempDir, 'diff')

function diffPathToRelative(filePath: string) {
	filePath = filePath
		.replace(/\\\\/g, path.sep)
		.replace(/\\|\//g, path.sep)
		.replace(/^("|')|("|')$/g, '')

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [workshopRootDirname, appId, ...relativePath] = filePath
		.replace(
			process.platform === 'win32'
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
	launchEditorPath: string,
) {
	if (!file.chunks.length) {
		return [`No changes`]
	}
	const filepath = file.type === 'RenamedFile' ? file.pathAfter : file.path
	const extension = path.extname(filepath).slice(1)
	const lang = getLanguage(extension)
	const pathToCopy = file.type === 'RenamedFile' ? file.pathBefore : file.path
	const relativePath = diffPathToRelative(pathToCopy)
	const markdownLines = []
	for (const chunk of file.chunks) {
		const removedLineNumbers = []
		const addedLineNumbers = []
		const lines = []
		const startLine =
			chunk.type === 'Chunk'
				? chunk.fromFileRange.start
				: chunk.type === 'CombinedChunk'
				? chunk.fromFileRangeA.start
				: 1
		for (let lineNumber = 0; lineNumber < chunk.changes.length; lineNumber++) {
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

		const params = new URLSearchParams(
			[
				['filename', relativePath],
				['start', startLine.toString()],
				removedLineNumbers.length
					? ['remove', removedLineNumbers.join(',')]
					: null,
				addedLineNumbers.length ? ['add', addedLineNumbers.join(',')] : null,
			].filter(typedBoolean),
		)
			.toString()
			.replace('&', ' ')

		markdownLines.push(`
<div className="relative">

\`\`\`${lang} ${params}
${lines.join('\n')}
\`\`\`

<div className="absolute top-3 right-3 bg-white px-1 py-0.5 font-mono text-xs font-semibold text-black">
	<LaunchEditor file=${JSON.stringify(
		launchEditorPath,
	)} line={${startLine}}>OPEN</LaunchEditor>
</div>

</div>
`)
	}
	return markdownLines
}

const EXTRA_FILES_TO_IGNORE = [
	/README(\.\d+)?\.md$/,
	/package-lock\.json$/,
	/\..*test\..*/,
]

async function copyUnignoredFiles(
	srcDir: string,
	destDir: string,
	ignore: Array<string>,
) {
	const { isGitIgnored } = await import('globby')

	const isIgnored = await isGitIgnored({ cwd: srcDir })

	await fsExtra.copy(srcDir, destDir, {
		filter: async file => {
			if (file === srcDir) return true
			return (
				!isIgnored(file) &&
				![...ignore, ...EXTRA_FILES_TO_IGNORE].some(f =>
					typeof f === 'string' ? file.includes(f) : f.test(file),
				)
			)
		},
	})
}

async function prepareForDiff(app1: App, app2: App) {
	const workshopRoot = await getWorkshopRoot()
	const app1CopyPath = path.join(
		diffTmpDir,
		path.basename(workshopRoot),
		app1.id,
	)
	const app2CopyPath = path.join(
		diffTmpDir,
		path.basename(workshopRoot),
		app2.id,
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
		fsExtra
			.emptyDir(app1CopyPath)
			.then(() => copyUnignoredFiles(app1.fullPath, app1CopyPath, ignore)),
		fsExtra
			.emptyDir(app2CopyPath)
			.then(() => copyUnignoredFiles(app2.fullPath, app2CopyPath, ignore)),
	])
	return { app1CopyPath, app2CopyPath }
}

export async function getDiffFiles(app1: App, app2: App) {
	const { execa } = await import('execa')
	if (app1.name === app2.name) {
		return []
	}
	const { app1CopyPath, app2CopyPath } = await prepareForDiff(app1, app2)

	const { stdout: diffOutput } = await execa(
		'git',
		['diff', '--no-index', '--name-status', app1CopyPath, app2CopyPath],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to ignore the error
	).catch(e => e)

	const diffFiles = diffOutput
		.split('\n')
		.map(line => {
			const [status, filePath] = line
				.split(/\s/)
				.map(s => s.trim())
				.filter(typedBoolean)
			if (!status || !filePath) return null
			return {
				status: (status.startsWith('R')
					? 'renamed'
					: status === 'M'
					? 'modified'
					: status === 'D'
					? 'deleted'
					: status === 'A'
					? 'added'
					: 'unknown') as 'renamed' | 'moved' | 'deleted' | 'added' | 'unknown',
				path: filePath
					.replace(`${app1CopyPath}${path.sep}`, '')
					.replace(`${app2CopyPath}${path.sep}`, ''),
			}
		})
		.filter(typedBoolean)
	return diffFiles
}

export async function getDiffCode(
	app1: App,
	app2: App,
	{ forceFresh = false } = {},
) {
	return cachified({
		cache: diffCodeCache,
		forceFresh,
		key: `${app1.dirName}-${await getDirMtimeMs(app1.fullPath)}-${
			app2.dirName
		}-${await getDirMtimeMs(app2.fullPath)}`,
		getFreshValue: () => getDiffCodeImpl(app1, app2),
	})
}

async function getDiffCodeImpl(app1: App, app2: App) {
	const { execa } = await import('execa')
	let markdownLines = ['']

	if (app1.name === app2.name) {
		markdownLines.push('You are comparing the same app')
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
		],
		{ cwd: diffTmpDir },
		// --no-index implies --exit-code, so we need to ignore the error
	).catch(e => e)

	const parsed = parseGitDiff(diffOutput)

	if (!parsed.files.length) {
		markdownLines.push(
			'<div class="m-5 inline-flex items-center justify-center bg-black px-1 py-0.5 font-mono text-sm uppercase text-white">No changes</div>',
		)
	}
	for (const file of parsed.files) {
		const pathToCopy = file.type === 'RenamedFile' ? file.pathBefore : file.path
		const relativePath = diffPathToRelative(pathToCopy)
		const launchEditorPath = path.join(app1.fullPath, relativePath)
		switch (file.type) {
			case 'ChangedFile': {
				markdownLines.push(`

<Accordion title={\`${relativePath}\`} variant="changed">

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</Accordion>

`)
				break
			}
			case 'DeletedFile': {
				markdownLines.push(`
<Accordion title={\`${relativePath}\`} variant="deleted">

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</Accordion>
`)
				break
			}
			case 'RenamedFile': {
				markdownLines.push(`
<Accordion title={\`${diffPathToRelative(
					file.pathBefore,
				)} ▶️ ${diffPathToRelative(file.pathAfter)}\`} variant="renamed">

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</Accordion>
<details>
`)
				break
			}
			case 'AddedFile': {
				markdownLines.push(`
<Accordion title={\`${relativePath}\`} variant="added">

${getFileCodeblocks(file, launchEditorPath).join('\n')}

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
