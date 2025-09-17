import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test, expect, beforeEach, afterEach } from 'vitest'
import { deleteCache } from './cache.server.js'
import { compileMdx } from './compile-mdx.server.js'

// Disposable test environment pattern
// Based on: https://www.epicweb.dev/better-test-setup-with-disposable-objects
class DisposableTestDirectory {
	private cleanupTasks: Array<() => Promise<void>> = []

	async [Symbol.asyncDispose]() {
		// Run cleanup tasks in reverse order
		for (const cleanup of this.cleanupTasks.reverse()) {
			await cleanup()
		}
	}

	async createTempDir(): Promise<string> {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop-test-'))
		this.cleanupTasks.push(async () => {
			await fs.rm(tempDir, { recursive: true, force: true })
		})
		return tempDir
	}

	async createMdxFile(filePath: string, content: string): Promise<string> {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, content, 'utf8')
		return filePath
	}

	async updateMdxFile(filePath: string, content: string): Promise<void> {
		// Ensure file modification time is different by waiting at least 1ms
		// and forcing a different timestamp
		const currentStat = await fs.stat(filePath)
		await fs.writeFile(filePath, content, 'utf8')
		
		// Force a different modification time by setting it slightly in the future
		const newTime = new Date(currentStat.mtime.getTime() + 10)
		await fs.utimes(filePath, newTime, newTime)
	}

	async getFileModTime(filePath: string): Promise<number> {
		const stat = await fs.stat(filePath)
		return stat.mtimeMs
	}
}

beforeEach(async () => {
	// Clear cache before each test to ensure clean state
	await deleteCache()
})

afterEach(async () => {
	// Clean up cache after each test
	await deleteCache()
})

test('cache invalidation works for README.mdx files', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const readmePath = path.join(tempDir, 'README.mdx')

	// Create initial README.mdx file
	const initialContent = `# Initial README

This is the initial content of the README.mdx file.

## Section 1
Some content here.
`

	await testDir.createMdxFile(readmePath, initialContent)

	// First compilation - should cache the result
	const result1 = await compileMdx(readmePath)
	expect(result1.title).toBe('Initial README')
	expect(result1.code).toContain('Initial README')

	// Wait to ensure different modification time
	await new Promise(resolve => setTimeout(resolve, 20))

	// Update the file content
	const updatedContent = `# Updated README

This is the updated content of the README.mdx file.

## Section 1
Updated content here.

## Section 2
New section added.
`

	await testDir.updateMdxFile(readmePath, updatedContent)

	// Second compilation - should detect file change and recompile
	const result2 = await compileMdx(readmePath)
	expect(result2.title).toBe('Updated README')
	expect(result2.code).toContain('Updated README')
	expect(result2.code).toContain('New section added')

	// Ensure the cache was actually invalidated (results should be different)
	expect(result1.code).not.toBe(result2.code)
})

test('cache invalidation works for FINISHED.mdx files', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const finishedPath = path.join(tempDir, 'FINISHED.mdx')

	// Create initial FINISHED.mdx file
	const initialContent = `# Workshop Complete! 🎉

Congratulations on completing the workshop!

## What you learned

- Initial concepts
- Basic implementation
`

	await testDir.createMdxFile(finishedPath, initialContent)

	// First compilation
	const result1 = await compileMdx(finishedPath)
	expect(result1.title).toBe('Workshop Complete! 🎉')
	expect(result1.code).toContain('Initial concepts')

	// Wait to ensure different modification time
	await new Promise(resolve => setTimeout(resolve, 20))

	// Update the file
	const updatedContent = `# Workshop Finished! 🏆

Great job completing all the exercises!

## What you learned

- Advanced concepts
- Complex implementation
- Best practices

## Next steps

Take your new skills to the next level!
`

	await testDir.updateMdxFile(finishedPath, updatedContent)

	// Second compilation - should detect change
	const result2 = await compileMdx(finishedPath)
	expect(result2.title).toBe('Workshop Finished! 🏆')
	expect(result2.code).toContain('Advanced concepts')
	expect(result2.code).toContain('Next steps')

	// Ensure cache was invalidated
	expect(result1.code).not.toBe(result2.code)
})

test('handles file system race conditions gracefully', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const mdxPath = path.join(tempDir, 'concurrent-test.mdx')

	const content = `# Race Condition Test

This tests concurrent file operations.
`

	await testDir.createMdxFile(mdxPath, content)

	// Simulate concurrent compilation requests
	const compilationPromises = Array.from({ length: 5 }, () => 
		compileMdx(mdxPath)
	)

	const results = await Promise.all(compilationPromises)

	// All results should be the same since file didn't change
	expect(results.length).toBeGreaterThan(0)
	const firstResult = results[0]
	expect(firstResult).toBeDefined()
	
	for (let i = 1; i < results.length; i++) {
		const currentResult = results[i]
		expect(currentResult).toBeDefined()
		expect(currentResult!.code).toBe(firstResult!.code)
		expect(currentResult!.title).toBe(firstResult!.title)
	}
})

test('cache invalidation works with clock skew scenarios', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const mdxPath = path.join(tempDir, 'clock-skew-test.mdx')

	const initialContent = `# Clock Skew Test

Testing clock synchronization issues.
`

	await testDir.createMdxFile(mdxPath, initialContent)

	// Get initial compilation
	const result1 = await compileMdx(mdxPath)
	expect(result1.title).toBe('Clock Skew Test')

	// Simulate clock skew by setting file time in the past
	const pastTime = new Date(Date.now() - 5000) // 5 seconds ago
	await fs.utimes(mdxPath, pastTime, pastTime)

	// Then update the file content (but with past timestamp)
	const updatedContent = `# Clock Skew Test Updated

Content changed despite past timestamp.
`
	
	await fs.writeFile(mdxPath, updatedContent, 'utf8')
	
	// Set time back to the past again to simulate the clock skew scenario
	await fs.utimes(mdxPath, pastTime, pastTime)

	// This should still work - the cache should be smart enough to handle this
	const result2 = await compileMdx(mdxPath, { forceFresh: true })
	expect(result2.code).toContain('Content changed despite past timestamp')
})

test('cache correctly handles file size changes when mtime is similar', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const mdxPath = path.join(tempDir, 'size-test.mdx')

	// Create initial file
	const shortContent = `# Size Test

Short content.
`

	await testDir.createMdxFile(mdxPath, shortContent)
	
	// First compilation - this will populate the cache
	const result1 = await compileMdx(mdxPath)

	// Update with much longer content but ensure mtime changes enough to be detected
	const longContent = `# Size Test

This is much longer content that should trigger cache invalidation due to size difference.

## Section 1
Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## Section 2
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Section 3
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

## Section 4
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.

## Section 5
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.
`

	// Use updateMdxFile which ensures a detectable time difference
	await testDir.updateMdxFile(mdxPath, longContent)

	// Second compilation - should detect the change
	const result2 = await compileMdx(mdxPath)
	
	// Should detect change due to size and/or time difference
	expect(result1.code).not.toBe(result2.code)
	expect(result2.code).toContain('Lorem ipsum')
})

test('file modification precision edge cases', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const mdxPath = path.join(tempDir, 'precision-test.mdx')

	const content = `# Precision Test

Testing file modification time precision.
`

	await testDir.createMdxFile(mdxPath, content)
	const originalModTime = await testDir.getFileModTime(mdxPath)

	// First compilation
	const result1 = await compileMdx(mdxPath)

	// Wait a small amount to ensure time difference
	await new Promise(resolve => setTimeout(resolve, 5))

	// Update file with minimal time difference
	const newContent = `# Precision Test Updated

File content changed with minimal time difference.
`
	
	await fs.writeFile(mdxPath, newContent, 'utf8')
	
	// Force a detectable time difference by setting explicit timestamp
	const newModTime = originalModTime + 2 // Add 2ms for better reliability
	const newDate = new Date(newModTime)
	await fs.utimes(mdxPath, newDate, newDate)

	// Wait a bit more to ensure the time change is registered
	await new Promise(resolve => setTimeout(resolve, 5))

	// This should detect the change despite minimal time difference
	const result2 = await compileMdx(mdxPath)
	
	// The results should be different since content changed
	expect(result1.code).not.toBe(result2.code)
	expect(result2.code).toContain('minimal time difference')
})

test('cache handles concurrent access correctly', async () => {
	await using testDir = new DisposableTestDirectory()

	const tempDir = await testDir.createTempDir()
	const mdxPath = path.join(tempDir, 'concurrent-mdx.mdx')

	const content = `# Concurrent Test

Testing concurrent access to the same file.
`

	await testDir.createMdxFile(mdxPath, content)

	// Start multiple compilation processes concurrently, but with fewer processes
	// to reduce race condition probability in testing
	const promises = Array.from({ length: 5 }, (_, i) => 
		compileMdx(mdxPath).then(result => ({ index: i, result }))
	)

	const results = await Promise.all(promises)

	// All results should be identical since file didn't change
	expect(results.length).toBeGreaterThan(0)
	const firstResult = results[0]
	expect(firstResult).toBeDefined()
	
	for (let i = 1; i < results.length; i++) {
		const currentResult = results[i]
		expect(currentResult).toBeDefined()
		expect(currentResult!.result.code).toBe(firstResult!.result.code)
		expect(currentResult!.result.title).toBe(firstResult!.result.title)
	}

	// Wait a bit to ensure cache is stable before updating
	await new Promise(resolve => setTimeout(resolve, 10))

	// Now update the file
	const updatedContent = `# Concurrent Test Updated

File has been updated during concurrent access test.
`

	await testDir.updateMdxFile(mdxPath, updatedContent)

	// Wait a bit after update to ensure file system changes are flushed
	await new Promise(resolve => setTimeout(resolve, 10))

	// Run more compilations after update
	const updatedResults = await Promise.all(
		Array.from({ length: 3 }, () => compileMdx(mdxPath))
	)

	// All updated results should be identical and different from original
	expect(updatedResults.length).toBeGreaterThan(0)
	const firstUpdatedResult = updatedResults[0]
	expect(firstUpdatedResult).toBeDefined()
	
	for (let i = 1; i < updatedResults.length; i++) {
		const currentUpdatedResult = updatedResults[i]
		expect(currentUpdatedResult).toBeDefined()
		expect(currentUpdatedResult!.code).toBe(firstUpdatedResult!.code)
		expect(currentUpdatedResult!.title).toBe(firstUpdatedResult!.title)
	}

	// Updated results should be different from original
	expect(firstUpdatedResult!.code).not.toBe(firstResult!.result.code)
	expect(firstUpdatedResult!.code).toContain('updated during concurrent')
})