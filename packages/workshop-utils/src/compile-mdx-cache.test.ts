import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { compiledInstructionMarkdownCache } from './cache.server.js'
import { compileMdx } from './compile-mdx.server.js'

// Disposable object for temporary files
function createTempFile(name: string, content: string) {
	const tempDir = os.tmpdir()
	const testFile = path.join(tempDir, name)
	fs.writeFileSync(testFile, content)

	return {
		path: testFile,
		updateContent(newContent: string) {
			// Small delay to ensure mtime changes
			const now = Date.now()
			while (Date.now() - now < 2) {
				// wait
			}
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

// Disposable object for cache cleanup
function createCacheCleanup(cacheKey: string) {
	return {
		async [Symbol.asyncDispose]() {
			try {
				await compiledInstructionMarkdownCache.delete(cacheKey)
			} catch {
				// Ignore cleanup errors
			}
		},
	}
}

describe('compileMdx cache invalidation', () => {
	beforeEach(async () => {
		// Clear any existing cache entries before each test
		// Note: we can't easily clear the entire cache without internal access,
		// so we'll use disposable cleanup objects instead
	})

	afterEach(() => {
		// Reset deployment environment
		delete process.env.EPICSHOP_DEPLOYED
	})

	it('should invalidate cache when file is modified', async () => {
		const originalContent = `# Original Title

Original content.
`
		const updatedContent = `# Updated Title

Updated content.
`

		using tempFile = createTempFile('cache-invalidation-test.mdx', originalContent)
		const cacheKey = `file:${tempFile.path}`
		await using ignoredCacheCleanup = createCacheCleanup(cacheKey)

		// First compilation should cache the result
		const firstResult = await compileMdx(tempFile.path)
		expect(firstResult.title).toBe('Original Title')

		// Verify cache entry exists
		const cacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(cacheEntry).toBeTruthy()
		expect(cacheEntry?.value.title).toBe('Original Title')

		// Update file content
		tempFile.updateContent(updatedContent)

		// Second compilation should detect file change and recompile
		const secondResult = await compileMdx(tempFile.path)
		expect(secondResult.title).toBe('Updated Title')
	})

	it('should use cache when file has not been modified', async () => {
		const content = `# Cached Title

Cached content.
`

		using tempFile = createTempFile('cache-reuse-test.mdx', content)
		const cacheKey = `file:${tempFile.path}`
		await using ignoredCacheCleanup = createCacheCleanup(cacheKey)

		// First compilation
		const firstResult = await compileMdx(tempFile.path)
		expect(firstResult.title).toBe('Cached Title')

		// Get cache entry to verify it exists
		const cacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(cacheEntry).toBeTruthy()
		const createdTime = cacheEntry!.metadata.createdTime

		// Second compilation without file changes should use cache
		const secondResult = await compileMdx(tempFile.path)
		expect(secondResult.title).toBe('Cached Title')

		// Cache entry should be the same (not recreated)
		const secondCacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(secondCacheEntry!.metadata.createdTime).toBe(createdTime)
	})

	it('should force fresh compilation when forceFresh is true', async () => {
		const content = `# Force Fresh Title

Force fresh content.
`

		using tempFile = createTempFile('force-fresh-test.mdx', content)
		const cacheKey = `file:${tempFile.path}`
		await using ignoredCacheCleanup = createCacheCleanup(cacheKey)

		// First compilation
		const firstResult = await compileMdx(tempFile.path)
		expect(firstResult.title).toBe('Force Fresh Title')

		const firstCacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(firstCacheEntry).toBeTruthy()
		const firstCreatedTime = firstCacheEntry!.metadata.createdTime

		// Second compilation with forceFresh should ignore cache
		const secondResult = await compileMdx(tempFile.path, { forceFresh: true })
		expect(secondResult.title).toBe('Force Fresh Title')

		// Cache should be updated with new entry
		const secondCacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(secondCacheEntry!.metadata.createdTime).toBeGreaterThan(firstCreatedTime)
	})

	it('should treat missing cache entry as requiring fresh compilation', async () => {
		const content = `# Missing Cache Title

Missing cache content.
`

		using tempFile = createTempFile('missing-cache-test.mdx', content)
		const cacheKey = `file:${tempFile.path}`
		await using ignoredCacheCleanup = createCacheCleanup(cacheKey)

		// Ensure no cache entry exists
		const initialCacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(initialCacheEntry).toBeNull()

		// Compilation should work and create cache entry
		const result = await compileMdx(tempFile.path)
		expect(result.title).toBe('Missing Cache Title')

		// Cache entry should now exist
		const cacheEntry = await compiledInstructionMarkdownCache.get(cacheKey)
		expect(cacheEntry).toBeTruthy()
		expect(cacheEntry?.value.title).toBe('Missing Cache Title')
	})

	it('should optimize for deployed environments', async () => {
		// Set deployed environment
		process.env.EPICSHOP_DEPLOYED = 'true'

		const content = `# Deployed Title

Deployed content.
`

		using tempFile = createTempFile('deployed-test.mdx', content)
		const cacheKey = `file:${tempFile.path}`
		await using ignoredCacheCleanup = createCacheCleanup(cacheKey)

		// First compilation in deployed mode
		const firstResult = await compileMdx(tempFile.path)
		expect(firstResult.title).toBe('Deployed Title')

		// Update file (simulating deployment scenario where this shouldn't happen)
		tempFile.updateContent(`# Should Not Update

This should not be seen in deployed mode.
`)

		// In deployed mode, cache should still be used even if file changes
		// (because files shouldn't change in deployed environments)
		const secondResult = await compileMdx(tempFile.path)
		expect(secondResult.title).toBe('Deployed Title')
	})

	it('should still force fresh in deployed mode when explicitly requested', async () => {
		// Set deployed environment
		process.env.EPICSHOP_DEPLOYED = 'true'

		const content = `# Deployed Force Fresh Title

Deployed force fresh content.
`

		using tempFile = createTempFile('deployed-force-fresh-test.mdx', content)
		const cacheKey = `file:${tempFile.path}`
		await using ignoredCacheCleanup = createCacheCleanup(cacheKey)

		// First compilation
		const firstResult = await compileMdx(tempFile.path)
		expect(firstResult.title).toBe('Deployed Force Fresh Title')

		// Update file content
		tempFile.updateContent(`# Updated Deployed Title

Updated deployed content.
`)

		// Even in deployed mode, forceFresh should work
		const secondResult = await compileMdx(tempFile.path, { forceFresh: true })
		expect(secondResult.title).toBe('Updated Deployed Title')
	})
})