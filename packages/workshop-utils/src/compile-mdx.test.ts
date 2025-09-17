import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { compileMdx } from './compile-mdx.server.js'

describe('compileMdx title parsing', () => {
	it('should extract title with backticks correctly', async () => {
		// Create a temporary MDX file with backticks in title
		const testMdxContent = `# Title with \`something\` highlighted

This is some content.
`
		
		const tempDir = os.tmpdir()
		const testFile = path.join(tempDir, 'test-backtick-title.mdx')
		
		try {
			fs.writeFileSync(testFile, testMdxContent)
			
			const result = await compileMdx(testFile)
			
			// The title should be extracted correctly, preserving the full text
			expect(result.title).toBe('Title with `something` highlighted')
		} finally {
			// Clean up the temporary file
			try {
				fs.unlinkSync(testFile)
			} catch {
				// Ignore cleanup errors
			}
		}
	})

	it('should extract title with multiple backticks correctly', async () => {
		const testMdxContent = `# \`Code\` and \`more code\` in title

This is some content.
`
		
		const tempDir = os.tmpdir()
		const testFile = path.join(tempDir, 'test-multiple-backticks.mdx')
		
		try {
			fs.writeFileSync(testFile, testMdxContent)
			
			const result = await compileMdx(testFile)
			
			expect(result.title).toBe('`Code` and `more code` in title')
		} finally {
			try {
				fs.unlinkSync(testFile)
			} catch {
				// Ignore cleanup errors
			}
		}
	})

	it('should extract title with mixed markdown correctly', async () => {
		const testMdxContent = `# Title with \`code\` and **bold** text

This is some content.
`
		
		const tempDir = os.tmpdir()
		const testFile = path.join(tempDir, 'test-mixed-markdown.mdx')
		
		try {
			fs.writeFileSync(testFile, testMdxContent)
			
			const result = await compileMdx(testFile)
			
			// Bold formatting should be stripped, but backticks preserved
			expect(result.title).toBe('Title with `code` and bold text')
		} finally {
			try {
				fs.unlinkSync(testFile)
			} catch {
				// Ignore cleanup errors
			}
		}
	})
})