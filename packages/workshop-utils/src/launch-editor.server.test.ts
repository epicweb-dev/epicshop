import { expect, test } from 'vitest'
import { parseEditorCommand } from './launch-editor.server.ts'

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
