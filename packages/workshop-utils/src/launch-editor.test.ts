import { test, expect, describe } from 'vitest'

/**
 * Helper function to quote arguments for Windows cmd.exe
 * This is the same logic used in launch-editor.server.ts
 */
function quoteForCmd(arg: string): string {
	// If the argument contains spaces or double quotes, wrap it in double quotes
	// Escape any existing double quotes by doubling them (cmd.exe style)
	if (/[\s"]/.test(arg)) {
		return `"${arg.replace(/"/g, '""')}"`
	}
	return arg
}

describe('quoteForCmd (Windows command quoting)', () => {
	test('should quote paths with spaces', () => {
		const pathWithSpaces = 'C:\\Users\\test\\Application Data\\epicshop\\data.json'
		const quoted = quoteForCmd(pathWithSpaces)

		expect(quoted).toBe(`"${pathWithSpaces}"`)
	})

	test('should not quote paths without spaces', () => {
		const pathWithoutSpaces = 'C:\\Users\\test\\epicshop\\data.json'
		const quoted = quoteForCmd(pathWithoutSpaces)

		expect(quoted).toBe(pathWithoutSpaces)
	})

	test('should escape existing double quotes and wrap in quotes', () => {
		const pathWithQuotes = 'C:\\Users\\test\\My "Special" Folder\\data.json'
		const quoted = quoteForCmd(pathWithQuotes)

		// Should escape quotes by doubling them and wrap the whole thing
		expect(quoted).toBe('"C:\\Users\\test\\My ""Special"" Folder\\data.json"')
	})

	test('should handle macOS-style paths with spaces', () => {
		const macPath = '/Users/test/Library/Application Support/epicshop/data.json'
		const quoted = quoteForCmd(macPath)

		expect(quoted).toBe(`"${macPath}"`)
	})

	test('should handle paths with multiple spaces', () => {
		const path = 'C:\\Program Files\\My App\\Some Folder\\data.json'
		const quoted = quoteForCmd(path)

		expect(quoted).toBe(`"${path}"`)
	})

	test('should handle VS Code -g argument format with spaces in path', () => {
		// When VS Code is used, the argument is formatted as file:line:column
		const fileArg = '/Users/test/Library/Application Support/epicshop/data.json:1:1'
		const quoted = quoteForCmd(fileArg)

		expect(quoted).toBe(`"${fileArg}"`)
	})

	test('should handle empty strings', () => {
		const quoted = quoteForCmd('')
		expect(quoted).toBe('')
	})

	test('should handle strings with only quotes', () => {
		// Input: "test" (with actual quote characters)
		// After escaping: ""test"" (quotes doubled)
		// After wrapping: """test""" (wrapped in outer quotes)
		const quoted = quoteForCmd('"test"')
		expect(quoted).toBe('"""test"""')
	})
})

describe('Windows command construction', () => {
	test('should construct proper cmd.exe command with quoted paths', () => {
		const editor = 'code'
		const pathWithSpaces =
			'/Users/test/Library/Application Support/epicshop/data.json:1:1'

		const quotedEditor = quoteForCmd(editor)
		const quotedPath = quoteForCmd(pathWithSpaces)
		const command = [quotedEditor, '-g', quotedPath].join(' ')

		// Editor shouldn't be quoted (no spaces)
		expect(command).toContain('code')
		// Path should be quoted
		expect(command).toContain('"')
		expect(command).toContain('Application Support')
	})

	test('should handle editor paths with spaces', () => {
		const editor = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'
		const filePath = '/Users/test/data.json:1:1'

		const quotedEditor = quoteForCmd(editor)
		const quotedPath = quoteForCmd(filePath)
		const command = [quotedEditor, '-g', quotedPath].join(' ')

		// Both should be handled correctly
		expect(command).toContain('Visual Studio Code')
		// Editor path should be quoted due to space
		expect(command.startsWith('"')).toBe(true)
	})
})
