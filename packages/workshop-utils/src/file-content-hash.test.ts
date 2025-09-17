import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getFileContentHash, createContentBasedCacheKey } from './file-content-hash.server.js'

// Disposable object for temporary files following the pattern from the docs
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

describe('file-content-hash', () => {
	describe('getFileContentHash', () => {
		it('should return consistent hash for same content', async () => {
			using tempFile = createTempFile('test-hash-1.txt', 'Hello World')
			
			const hash1 = await getFileContentHash(tempFile.path)
			const hash2 = await getFileContentHash(tempFile.path)
			
			expect(hash1).toBe(hash2)
			expect(hash1).toEqual(expect.any(String))
			expect(hash1?.length).toBeGreaterThan(0)
		})

		it('should return different hash for different content', async () => {
			using tempFile1 = createTempFile('test-hash-2a.txt', 'Content A')
			using tempFile2 = createTempFile('test-hash-2b.txt', 'Content B')
			
			const hash1 = await getFileContentHash(tempFile1.path)
			const hash2 = await getFileContentHash(tempFile2.path)
			
			expect(hash1).not.toBe(hash2)
		})

		it('should return new hash when content changes', async () => {
			using tempFile = createTempFile('test-hash-3.txt', 'Initial content')
			
			const hash1 = await getFileContentHash(tempFile.path)
			
			tempFile.updateContent('Modified content')
			
			const hash2 = await getFileContentHash(tempFile.path)
			
			expect(hash1).not.toBe(hash2)
		})

		it('should return null for non-existent file', async () => {
			const hash = await getFileContentHash('/non/existent/file.txt')
			expect(hash).toBeNull()
		})

		it('should handle MDX content correctly', async () => {
			const mdxContent = `# Test Title

This is some MDX content with \`code\` and **bold** text.

<SomeComponent prop="value" />
`
			using tempFile = createTempFile('test-hash-mdx.mdx', mdxContent)
			
			const hash1 = await getFileContentHash(tempFile.path)
			
			// Add a small change
			const modifiedContent = mdxContent + '\nAdditional line'
			tempFile.updateContent(modifiedContent)
			
			const hash2 = await getFileContentHash(tempFile.path)
			
			expect(hash1).not.toBe(hash2)
		})
	})

	describe('createContentBasedCacheKey', () => {
		it('should create cache key with content hash', async () => {
			using tempFile = createTempFile('test-key-1.txt', 'Test content')
			
			const key = await createContentBasedCacheKey(tempFile.path)
			
			expect(key).toMatch(/^file:.*:[\da-f]+$/)
			expect(key).toContain(tempFile.path)
		})

		it('should use custom base key when provided', async () => {
			using tempFile = createTempFile('test-key-2.txt', 'Test content')
			
			const key = await createContentBasedCacheKey(tempFile.path, 'custom:key')
			
			expect(key).toMatch(/^custom:key:[\da-f]+$/)
		})

		it('should return base key without hash for non-existent file', async () => {
			const key = await createContentBasedCacheKey('/non/existent/file.txt')
			
			expect(key).toBe('file:/non/existent/file.txt')
		})

		it('should return custom base key without hash for non-existent file', async () => {
			const key = await createContentBasedCacheKey('/non/existent/file.txt', 'custom:key')
			
			expect(key).toBe('custom:key')
		})

		it('should create different keys for different content', async () => {
			using tempFile1 = createTempFile('test-key-3a.txt', 'Content A')
			using tempFile2 = createTempFile('test-key-3b.txt', 'Content B')
			
			const key1 = await createContentBasedCacheKey(tempFile1.path, 'test:key')
			const key2 = await createContentBasedCacheKey(tempFile2.path, 'test:key')
			
			expect(key1).not.toBe(key2)
			expect(key1).toMatch(/^test:key:[\da-f]+$/)
			expect(key2).toMatch(/^test:key:[\da-f]+$/)
		})

		it('should create different keys when content changes', async () => {
			using tempFile = createTempFile('test-key-4.txt', 'Initial content')
			
			const key1 = await createContentBasedCacheKey(tempFile.path, 'test:key')
			
			tempFile.updateContent('Modified content')
			
			const key2 = await createContentBasedCacheKey(tempFile.path, 'test:key')
			
			expect(key1).not.toBe(key2)
		})
	})
})