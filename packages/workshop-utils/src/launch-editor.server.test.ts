import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
	getWindowsEditorCommand,
	getWindowsEditorCommandArgs,
	launchEditor,
	parseEditorCommand,
} from './launch-editor.server.ts'

function withEditorEnv(editor: string) {
	const original = process.env.EPICSHOP_EDITOR
	process.env.EPICSHOP_EDITOR = editor
	return {
		[Symbol.dispose]() {
			if (original === undefined) {
				delete process.env.EPICSHOP_EDITOR
			} else {
				process.env.EPICSHOP_EDITOR = original
			}
		},
	}
}

function createTempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epicshop-launch-editor-'))
	return {
		dir,
		[Symbol.dispose]() {
			fs.rmSync(dir, { recursive: true, force: true })
		},
	}
}

test('preserves unquoted Windows editor paths', () => {
	const editor = String.raw`C:\Users\James\AppData\Local\Programs\cursor\Cursor.exe`

	expect(parseEditorCommand(editor, 'win32')).toEqual([editor])
})

test('preserves unquoted Windows editor paths with arguments', () => {
	const editor = String.raw`C:\Program Files\Microsoft VS Code\bin\code.cmd`

	expect(parseEditorCommand(`${editor} --reuse-window`, 'win32')).toEqual([
		editor,
		'--reuse-window',
	])
})

test('keeps shell parsing for non-Windows editor commands', () => {
	expect(parseEditorCommand('code --reuse-window', 'linux')).toEqual([
		'code',
		'--reuse-window',
	])
})

test('quotes Windows editor command arguments with spaces (aha)', () => {
	const editor = 'code'
	const workshopPath = String.raw`C:\Users\Campbell L Mitchell\Campbell - Ensign College\epicshop-tutorial`

	expect(getWindowsEditorCommandArgs(editor, [workshopPath])).toEqual([
		'/D',
		'/S',
		'/C',
		String.raw`""code" "C:\Users\Campbell L Mitchell\Campbell - Ensign College\epicshop-tutorial""`,
	])
})

// These launch real child processes, which follows a different code path on
// Windows (via cmd.exe). CI runs unit tests on Linux.
test.skipIf(process.platform === 'win32')(
	'includes the editor command, exit code, editor output, and config help when the editor fails (aha)',
	async () => {
		using temp = createTempDir()
		const failingEditor = path.join(temp.dir, 'failing-editor.cjs')
		fs.writeFileSync(
			failingEditor,
			"console.error('editor exploded')\nprocess.exit(1)\n",
		)
		using _env = withEditorEnv(`${process.execPath} ${failingEditor}`)

		const resultPromise = launchEditor(path.join(temp.dir, 'index.js'))
		await expect(resultPromise).resolves.toMatchObject({ status: 'error' })
		const result = await resultPromise
		if (result.status !== 'error') throw new Error('expected an error result')
		expect(result.message).toContain(`"${process.execPath}"`)
		expect(result.message).toContain('exited with error code 1')
		expect(result.details).toContain('editor exploded')
		expect(result.details).toContain('EPICSHOP_EDITOR')
		expect(result.details).toContain('/guide#file-links-troubleshooting')
	},
)

test.skipIf(process.platform === 'win32')(
	'explains missing editor commands and how to configure EPICSHOP_EDITOR (aha)',
	async () => {
		using temp = createTempDir()
		using _env = withEditorEnv('definitely-not-a-real-editor-command')

		const result = await launchEditor(path.join(temp.dir, 'index.js'))
		if (result.status !== 'error') throw new Error('expected an error result')
		expect(result.message).toContain(
			'The editor command "definitely-not-a-real-editor-command" was not found',
		)
		expect(result.details).toContain('EPICSHOP_EDITOR')
		expect(result.details).toContain('/guide#file-links-troubleshooting')
	},
)

test('quotes Windows editor paths with spaces and preserves editor args', () => {
	const editor = String.raw`C:\Program Files\Microsoft VS Code\bin\code.cmd`
	const workshopPath = String.raw`C:\Users\Campbell L Mitchell\epicshop-tutorial`

	expect(
		getWindowsEditorCommandArgs(editor, ['--reuse-window', workshopPath]),
	).toEqual([
		'/D',
		'/S',
		'/C',
		String.raw`""C:\Program Files\Microsoft VS Code\bin\code.cmd" "--reuse-window" "C:\Users\Campbell L Mitchell\epicshop-tutorial""`,
	])
})

test('passes the wrapped command to cmd without Node rewriting its quotes (aha)', () => {
	const editor = String.raw`C:\Users\Ada\AppData\Local\Programs\Microsoft VS Code\Code.exe`
	const fileName = String.raw`C:\Users\Ada\Epic Workshop\index.ts`

	expect(getWindowsEditorCommand(editor, ['-g', `${fileName}:1:1`])).toEqual({
		file: 'cmd.exe',
		args: [
			'/D',
			'/S',
			'/C',
			String.raw`""C:\Users\Ada\AppData\Local\Programs\Microsoft VS Code\Code.exe" "-g" "C:\Users\Ada\Epic Workshop\index.ts:1:1""`,
		],
		options: { windowsVerbatimArguments: true },
	})
})
