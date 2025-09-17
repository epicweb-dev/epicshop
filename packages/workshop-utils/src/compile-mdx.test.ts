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
		updateContent(newContent: string) {
			fs.writeFileSync(testFile, newContent)
		},
		[Symbol.dispose]() {
			try {
				fs.unlinkSync(testFile)
			} catch {
				// Ignore cleanup errors
			}
		},
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

		using tempFile = createTempFile(
			'test-multiple-backticks.mdx',
			testMdxContent,
		)

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

describe('compileMdx cache invalidation', () => {
	it('should recompile when file content changes', async () => {
		const initialContent = `# Initial Title

Initial content here.
`

		const modifiedContent = `# Modified Title

Modified content here.
`

		using tempFile = createTempFile('test-cache-invalidation.mdx', initialContent)

		// First compilation
		const result1 = await compileMdx(tempFile.path)
		expect(result1.title).toBe('Initial Title')

		// Update file content
		tempFile.updateContent(modifiedContent)

		// Second compilation should detect the change and return new content
		const result2 = await compileMdx(tempFile.path)
		expect(result2.title).toBe('Modified Title')
		
		// The compiled code should also be different
		expect(result1.code).not.toBe(result2.code)
	})

	it('should return same result for unchanged file content', async () => {
		const content = `# Consistent Title

This content doesn't change.
`

		using tempFile = createTempFile('test-cache-consistency.mdx', content)

		// First compilation
		const result1 = await compileMdx(tempFile.path)
		
		// Second compilation without changes should potentially use cache
		const result2 = await compileMdx(tempFile.path)
		
		// Results should be identical
		expect(result1.title).toBe(result2.title)
		expect(result1.code).toBe(result2.code)
	})

	it('should handle README.mdx files correctly', async () => {
		const readmeContent = `# Exercise Instructions

## Problem

This is the problem description.

## Solution

This is the solution.
`

		const modifiedReadmeContent = `# Updated Exercise Instructions

## Problem

This is the updated problem description.

## Solution

This is the updated solution.
`

		using tempFile = createTempFile('README.mdx', readmeContent)

		// First compilation
		const result1 = await compileMdx(tempFile.path)
		expect(result1.title).toBe('Exercise Instructions')

		// Update README content
		tempFile.updateContent(modifiedReadmeContent)

		// Should detect the change
		const result2 = await compileMdx(tempFile.path)
		expect(result2.title).toBe('Updated Exercise Instructions')
		expect(result1.code).not.toBe(result2.code)
	})

	it('should handle FINISHED.mdx files correctly', async () => {
		const finishedContent = `# Workshop Complete

Congratulations! You've finished the workshop.

## Next Steps

Here are some next steps.
`

		const modifiedFinishedContent = `# Workshop Successfully Complete

Congratulations! You've successfully finished the workshop.

## Next Steps

Here are some recommended next steps.
`

		using tempFile = createTempFile('FINISHED.mdx', finishedContent)

		// First compilation
		const result1 = await compileMdx(tempFile.path)
		expect(result1.title).toBe('Workshop Complete')

		// Update FINISHED content
		tempFile.updateContent(modifiedFinishedContent)

		// Should detect the change
		const result2 = await compileMdx(tempFile.path)
		expect(result2.title).toBe('Workshop Successfully Complete')
		expect(result1.code).not.toBe(result2.code)
	})

	it('should handle small content changes correctly', async () => {
		const initialContent = `# Test Title

Some content with specific details.
`

		const slightlyModifiedContent = `# Test Title

Some content with slightly different details.
`

		using tempFile = createTempFile('test-small-changes.mdx', initialContent)

		// First compilation
		const result1 = await compileMdx(tempFile.path)

		// Make a small change
		tempFile.updateContent(slightlyModifiedContent)

		// Should still detect the change
		const result2 = await compileMdx(tempFile.path)
		
		// Title should be the same but code should be different
		expect(result1.title).toBe(result2.title)
		expect(result1.code).not.toBe(result2.code)
	})
})
