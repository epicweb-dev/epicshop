import fsExtra from 'fs-extra'
import os from 'os'
import parseGitDiff from 'parse-git-diff'
import path from 'path'
import { BUNDLED_LANGUAGES } from 'shiki'
import { compileMarkdownString } from './compile-mdx.server'
import { typedBoolean } from './misc'
import { type App } from './misc.server'

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
) {
	if (!file.chunks.length) {
		return [`No changes`]
	}
	const filepath = file.type === 'RenamedFile' ? file.pathAfter : file.path
	const extension = path.extname(filepath).slice(1)
	const lang = getLanguage(extension)
	const markdownLines = []
	for (const chunk of file.chunks) {
		const removedLineNumbers = []
		const addedLineNumbers = []
		const lines = []
		const startLine = chunk.toFileRange.start
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
				['filename', diffPathToRelative(filepath)],
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
\`\`\`${lang} ${params}
${lines.join('\n')}
\`\`\`
`)
	}
	return markdownLines
}

const EXTRA_FILES_TO_IGNORE = [/README(\.\d+)?\.md$/]

async function copyUnignoredFiles(srcDir: string, destDir: string) {
	const { isGitIgnored } = await import('globby')

	const isIgnored = await isGitIgnored({ cwd: srcDir })

	await fsExtra.copy(srcDir, destDir, {
		filter: async file => {
			if (file === srcDir) return true
			return !isIgnored(file) && !EXTRA_FILES_TO_IGNORE.some(f => f.test(file))
		},
	})
}

async function prepareForDiff(app1: App, app2: App) {
	const app1CopyPath = path.join(diffTmpDir, app1.dirName)
	const app2CopyPath = path.join(diffTmpDir, app2.dirName)
	await Promise.all([
		fsExtra
			.emptyDir(app1CopyPath)
			.then(() => copyUnignoredFiles(app1.fullPath, app1CopyPath)),
		fsExtra
			.emptyDir(app2CopyPath)
			.then(() => copyUnignoredFiles(app2.fullPath, app2CopyPath)),
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
				path: path.replace(`${diffTmpDir}/`, ''),
			}
		})
		.filter(typedBoolean)
	return diffFiles
}

export async function getDiffCode(app1: App, app2: App) {
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
	for (const file of parsed.files) {
		switch (file.type) {
			case 'ChangedFile': {
				markdownLines.push(`
<details>

<summary>➕/➖ \`${diffPathToRelative(file.path)}\`</summary>

${getFileCodeblocks(file).join('\n')}

</details>
`)
				break
			}
			case 'DeletedFile': {
				markdownLines.push(`
<details>

<summary>➖ \`${diffPathToRelative(file.path)}\` (file deleted)</summary>

${getFileCodeblocks(file).join('\n')}

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

${getFileCodeblocks(file).join('\n')}

</details>
`)
				break
			}
			case 'AddedFile': {
				markdownLines.push(`
<details>

<summary>➕ \`${diffPathToRelative(file.path)}\` (file added)</summary>

${getFileCodeblocks(file).join('\n')}

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
