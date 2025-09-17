import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getFileContentHash, createContentBasedCacheKey, getMdxContentHashes, haveMdxFilesChanged } from './file-content-hash.server.js'

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

// Disposable object for temporary directories
function createTempDir(name: string) {
	const tempDir = os.tmpdir()
	const testDir = path.join(tempDir, name)
	fs.mkdirSync(testDir, { recursive: true })

	return {
		path: testDir,
		createFile(fileName: string, content: string) {
			const filePath = path.join(testDir, fileName)
			fs.writeFileSync(filePath, content)
			return filePath
		},
		[Symbol.dispose]() {
			try {
				fs.rmSync(testDir, { recursive: true, force: true })
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

	describe('getMdxContentHashes', () => {
		it('should get hashes for MDX files in directories', async () => {
			using tempDir = createTempDir('mdx-test-dir')
			
			// Create README.mdx and FINISHED.mdx files
			tempDir.createFile('README.mdx', '# README Content\nThis is a readme.')
			tempDir.createFile('FINISHED.mdx', '# Finished Content\nWorkshop complete!')
			tempDir.createFile('other.txt', 'Not an MDX file')
			
			const hashes = await getMdxContentHashes([tempDir.path])
			
			const readmePath = path.join(tempDir.path, 'README.mdx')
			const finishedPath = path.join(tempDir.path, 'FINISHED.mdx')
			
			expect(hashes[readmePath]).toEqual(expect.any(String))
			expect(hashes[finishedPath]).toEqual(expect.any(String))
			expect(hashes[readmePath]).not.toBe(hashes[finishedPath])
		})

		it('should handle directories without MDX files', async () => {
			using tempDir = createTempDir('no-mdx-dir')
			
			tempDir.createFile('other.txt', 'Not an MDX file')
			
			const hashes = await getMdxContentHashes([tempDir.path])
			
			const readmePath = path.join(tempDir.path, 'README.mdx')
			const finishedPath = path.join(tempDir.path, 'FINISHED.mdx')
			
			expect(hashes[readmePath]).toBeNull()
			expect(hashes[finishedPath]).toBeNull()
		})

		it('should handle multiple directories', async () => {
			using tempDir1 = createTempDir('mdx-dir-1')
			using tempDir2 = createTempDir('mdx-dir-2')
			
			tempDir1.createFile('README.mdx', '# Dir 1 README')
			tempDir2.createFile('FINISHED.mdx', '# Dir 2 FINISHED')
			
			const hashes = await getMdxContentHashes([tempDir1.path, tempDir2.path])
			
			const readme1Path = path.join(tempDir1.path, 'README.mdx')
			const finished2Path = path.join(tempDir2.path, 'FINISHED.mdx')
			
			expect(hashes[readme1Path]).toEqual(expect.any(String))
			expect(hashes[finished2Path]).toEqual(expect.any(String))
		})

		it('should handle empty directory list', async () => {
			const hashes = await getMdxContentHashes([])
			expect(hashes).toEqual({})
		})
	})

	describe('haveMdxFilesChanged', () => {
		it('should detect when MDX files have changed', async () => {
			using tempDir = createTempDir('change-test-dir')
			
			tempDir.createFile('README.mdx', '# Initial Content')
			
			const initialHashes = await getMdxContentHashes([tempDir.path])
			const mockHashStore = new Map([['test-key', initialHashes]])
			
			// Initially, no changes detected
			const changed1 = await haveMdxFilesChanged([tempDir.path], 'test-key', mockHashStore)
			expect(changed1).toBe(false)
			
			// Update the file
			tempDir.createFile('README.mdx', '# Modified Content')
			
			// Should detect the change
			const changed2 = await haveMdxFilesChanged([tempDir.path], 'test-key', mockHashStore)
			expect(changed2).toBe(true)
		})

		it('should return undefined when no baseline exists', async () => {
			using tempDir = createTempDir('no-baseline-dir')
			
			tempDir.createFile('README.mdx', '# Some Content')
			
			const mockHashStore = new Map() // Empty store
			
			const changed = await haveMdxFilesChanged([tempDir.path], 'nonexistent-key', mockHashStore)
			expect(changed).toBeUndefined()
		})

		it('should handle new files correctly', async () => {
			using tempDir = createTempDir('new-file-dir')
			
			// Start with only README.mdx
			tempDir.createFile('README.mdx', '# README')
			const initialHashes = await getMdxContentHashes([tempDir.path])
			const mockHashStore = new Map([['test-key', initialHashes]])
			
			// Add FINISHED.mdx
			tempDir.createFile('FINISHED.mdx', '# FINISHED')
			
			// Should detect the new file as a change
			const changed = await haveMdxFilesChanged([tempDir.path], 'test-key', mockHashStore)
			expect(changed).toBe(true)
		})

		it('should handle deleted files correctly', async () => {
			using tempDir = createTempDir('delete-file-dir')
			
			// Start with both files
			const readmePath = tempDir.createFile('README.mdx', '# README')
			tempDir.createFile('FINISHED.mdx', '# FINISHED')
			
			const initialHashes = await getMdxContentHashes([tempDir.path])
			const mockHashStore = new Map([['test-key', initialHashes]])
			
			// Delete one file
			fs.unlinkSync(readmePath)
			
			// Should detect the deletion as a change
			const changed = await haveMdxFilesChanged([tempDir.path], 'test-key', mockHashStore)
			expect(changed).toBe(true)
		})
	})
})