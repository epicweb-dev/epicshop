import { expect, test } from 'vitest'
import { WINDOWS_FILE_NAME_WHITELIST } from './launch-editor.server.ts'

test('WINDOWS_FILE_NAME_WHITELIST allows spaces in paths', () => {
	expect(
		WINDOWS_FILE_NAME_WHITELIST.test('C:\\Users\\Me\\My Folder\\db.sqlite'),
	).toBe(true)
	expect(
		WINDOWS_FILE_NAME_WHITELIST.test('C:/Users/Me/My Folder/db.sqlite'),
	).toBe(true)
})

test('WINDOWS_FILE_NAME_WHITELIST rejects dangerous characters', () => {
	expect(
		WINDOWS_FILE_NAME_WHITELIST.test('C:\\Users\\Me\\My Folder\\evil&calc.exe'),
	).toBe(false)
})
