import { expect, test } from 'vitest'
import {
	getWindowsEditorCommandArgs,
	parseEditorCommand,
} from './launch-editor.server.ts'

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
		String.raw`"code" "C:\Users\Campbell L Mitchell\Campbell - Ensign College\epicshop-tutorial"`,
	])
})

test('quotes Windows editor paths with spaces and preserves editor args', () => {
	const editor = String.raw`C:\Program Files\Microsoft VS Code\bin\code.cmd`
	const workshopPath = String.raw`C:\Users\Campbell L Mitchell\epicshop-tutorial`

	expect(
		getWindowsEditorCommandArgs(editor, ['--reuse-window', workshopPath]),
	).toEqual([
		'/D',
		'/S',
		'/C',
		String.raw`"C:\Program Files\Microsoft VS Code\bin\code.cmd" "--reuse-window" "C:\Users\Campbell L Mitchell\epicshop-tutorial"`,
	])
})
