import { cachified } from 'cachified'
import fsExtra from 'fs-extra'
import os from 'os'
import parseGitDiff from 'parse-git-diff'
import path from 'path'
import { BUNDLED_LANGUAGES } from 'shiki'
import { diffCodeCache } from './cache.server'
import { compileMarkdownString } from './compile-mdx.server'
import { typedBoolean } from './misc'
import { getDirMtimeMs, type App } from './misc.server'

const kcdshopTempDir = path.join(os.tmpdir(), 'kcdshop')

const diffTmpDir = path.join(kcdshopTempDir, 'diff')

function diffPathToRelative(filePath: string) {
	// for some reason the git diff output has no leading slash on these paths
	// also, we want to get rid of the leading slash on the resulting filePath.
	return filePath.replace(`${diffTmpDir.slice(1)}/`, '')
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

<div className="absolute bottom-0 translate-x-4 -translate-y-2 text-gray-300 opacity-75">
	<LaunchEditor file=${JSON.stringify(
		launchEditorPath,
	)} line={${startLine}}>Open</LaunchEditor>
</div>

</div>
`)
	}
	return markdownLines
}

const EXTRA_FILES_TO_IGNORE = [
	/README(\.\d+)?\.md$/,
	/package-lock\.json$/,
	/\.*test\.*/,
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
	const app1CopyPath = path.join(diffTmpDir, app1.dirName)
	const app2CopyPath = path.join(diffTmpDir, app2.dirName)
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
			const [status, path] = line
				.split(/\s/)
				.map(s => s.trim())
				.filter(typedBoolean)
			if (!status || !path) return null
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
				path: path
					.replace(`${app1CopyPath}/`, '')
					.replace(`${app2CopyPath}/`, ''),
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

	let markdownLines = [
		`
# Diff

\`${app1.name}\` vs \`${app2.name}\`
`,
	]
	if (!parsed.files.length) {
		markdownLines.push('No changes')
	}
	for (const file of parsed.files) {
		const pathToCopy = file.type === 'RenamedFile' ? file.pathBefore : file.path
		const relativePath = diffPathToRelative(pathToCopy)
		const [, ...restOfPath] = relativePath.split(path.sep)
		const launchEditorPath = path.join(app1.fullPath, ...restOfPath)
		switch (file.type) {
			case 'ChangedFile': {
				markdownLines.push(`
<details>

<summary>➕/➖ \`${relativePath}\`</summary>

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</details>
`)
				break
			}
			case 'DeletedFile': {
				markdownLines.push(`
<details>

<summary>➖ \`${relativePath}\` (file deleted)</summary>

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</details>
`)
				break
			}
			case 'RenamedFile': {
				markdownLines.push(`
<details>

<summary>\`${diffPathToRelative(file.pathBefore)}\` ▶️ \`${diffPathToRelative(
					file.pathAfter,
				)}\` (file renamed)</summary>

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</details>
`)
				break
			}
			case 'AddedFile': {
				markdownLines.push(`
<details>

<summary>➕ \`${relativePath}\` (file added)</summary>

${getFileCodeblocks(file, launchEditorPath).join('\n')}

</details>
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
