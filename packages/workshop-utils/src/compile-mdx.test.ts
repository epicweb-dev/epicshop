import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { compileMdx } from './compile-mdx.server.js'

// Disposable object for temporary files
function createTempFile(name: string, content: string) {
	const tempDir = os.tmpdir()
	const testFile = path.join(tempDir, name)
	fs.writeFileSync(testFile, content)
	
	return {
		path: testFile,
		[Symbol.dispose]() {
			try {
				fs.unlinkSync(testFile)
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}

describe('compileMdx title parsing', () => {
	it('should extract title with backticks correctly', async () => {
		// Create a temporary MDX file with backticks in title
		const testMdxContent = `# Title with \`something\` highlighted

This is some content.
`
		
		using tempFile = createTempFile('test-backtick-title.mdx', testMdxContent)
		
		const result = await compileMdx(tempFile.path)
		
		// The title should be extracted correctly, preserving the full text
		expect(result.title).toBe('Title with `something` highlighted')
	})

	it('should extract title with multiple backticks correctly', async () => {
		const testMdxContent = `# \`Code\` and \`more code\` in title

This is some content.
`
		
		using tempFile = createTempFile('test-multiple-backticks.mdx', testMdxContent)
		
		const result = await compileMdx(tempFile.path)
		
		expect(result.title).toBe('`Code` and `more code` in title')
	})

	it('should extract title with mixed markdown correctly', async () => {
		const testMdxContent = `# Title with \`code\` and **bold** text

This is some content.
`
		
		using tempFile = createTempFile('test-mixed-markdown.mdx', testMdxContent)
		
		const result = await compileMdx(tempFile.path)
		
		// Bold formatting should be stripped, but backticks preserved
		expect(result.title).toBe('Title with `code` and bold text')
	})
})