import fs from 'node:fs'
import path from 'node:path'
import { type CacheEntry } from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
import chokidar from 'chokidar'
import closeWithGrace from 'close-with-grace'
import { isGitIgnored } from 'globby'
import { getWorkshopRoot } from './apps.server.js'
import { getEnv } from './env.server.js'

type VirtualNode = {
	type: 'file' | 'directory'
	name: string
	path: string
	children?: Map<string, VirtualNode>
}

type VirtualFileSystem = {
	exercises: Map<string, VirtualNode>
	examples: Map<string, VirtualNode>
}

// Global state for virtual file system
let virtualFileSystem: VirtualFileSystem = {
	exercises: new Map(),
	examples: new Map(),
}

// Track initialization state
let isInitialized = false
let isInitializing = false

const ENV = getEnv()

// Modified times tracking for cache invalidation
export const modifiedTimes = remember(
	'modified_times',
	() => new Map<string, number>(),
)

/**
 * Initialize the virtual file system and set up file watching
 */
export async function initializeVirtualFileSystem(): Promise<void> {
	if (isInitialized || isInitializing) return
	
	isInitializing = true
	
	try {
		// Build initial virtual file system
		await buildVirtualFileSystem()
		
		// Set up file watcher if not in production
		if (!ENV.EPICSHOP_DEPLOYED && process.env.EPICSHOP_ENABLE_WATCHER === 'true') {
			await setupFileWatcher()
		}
		
		isInitialized = true
	} catch (error) {
		console.error('Failed to initialize virtual file system:', error)
		throw error
	} finally {
		isInitializing = false
	}
}

/**
 * Build the virtual file system from the actual file system
 */
async function buildVirtualFileSystem(): Promise<void> {
	const workshopRoot = getWorkshopRoot()
	
	// Clear existing virtual file system
	virtualFileSystem = {
		exercises: new Map(),
		examples: new Map(),
	}
	
	// Build exercises virtual file system (exercises/*/*)
	const exercisesPath = path.join(workshopRoot, 'exercises')
	if (await exists(exercisesPath)) {
		const exerciseDirs = await readDir(exercisesPath)
		for (const exerciseDir of exerciseDirs) {
			const exercisePath = path.join(exercisesPath, exerciseDir)
			const exerciseNode = await buildVirtualNode(exercisePath)
			if (exerciseNode) {
				virtualFileSystem.exercises.set(exerciseDir, exerciseNode)
			}
		}
	}
	
	// Build examples virtual file system (examples/*)
	const examplesPath = path.join(workshopRoot, 'examples')
	if (await exists(examplesPath)) {
		const exampleDirs = await readDir(examplesPath)
		for (const exampleDir of exampleDirs) {
			const examplePath = path.join(examplesPath, exampleDir)
			const exampleNode = await buildVirtualNode(examplePath)
			if (exampleNode) {
				virtualFileSystem.examples.set(exampleDir, exampleNode)
			}
		}
	}
}

/**
 * Build a virtual node for a given path
 */
async function buildVirtualNode(fullPath: string): Promise<VirtualNode | null> {
	try {
		const stats = await fs.promises.stat(fullPath)
		const name = path.basename(fullPath)
		
		if (stats.isDirectory()) {
			const children = new Map<string, VirtualNode>()
			const dirContents = await readDir(fullPath)
			
			for (const item of dirContents) {
				const itemPath = path.join(fullPath, item)
				const childNode = await buildVirtualNode(itemPath)
				if (childNode) {
					children.set(item, childNode)
				}
			}
			
			return {
				type: 'directory',
				name,
				path: fullPath,
				children,
			}
		} else {
			return {
				type: 'file',
				name,
				path: fullPath,
			}
		}
	} catch (error) {
		// If we can't read the path, return null
		return null
	}
}

/**
 * Set up file watcher for exercises, examples, and playground directories
 */
async function setupFileWatcher(): Promise<void> {
	const workshopRoot = getWorkshopRoot()
	const isIgnored = await isGitIgnored({ cwd: workshopRoot })
	
	// Files to watch for changes that affect apps
	const filesToWatch = ['README.mdx', 'FINISHED.mdx', 'package.json']
	
	const watcher = chokidar.watch(['exercises', 'examples', 'playground'], {
		cwd: workshopRoot,
		ignoreInitial: true,
		ignored(filePath, stats) {
			if (isIgnored(filePath)) return true
			if (filePath.includes('.git')) return true
			
			const pathParts = filePath.split(path.sep)
			const rootDir = pathParts[0]
			
			if (rootDir === 'exercises') {
				// Allow exercises/*/* (max depth 2)
				return pathParts.length > 3
			}
			
			if (rootDir === 'examples') {
				// Allow examples/* (max depth 1)
				return pathParts.length > 2
			}
			
			if (rootDir === 'playground') {
				// For playground, allow directories but filter files
				if (stats?.isDirectory()) {
					if (filePath.endsWith('playground')) return false
					return true
				}
				
				return stats?.isFile()
					? !filesToWatch.some((file) => filePath.endsWith(file))
					: false
			}
			
			return false
		},
	})
	
	watcher.on('all', async (event, filePath) => {
		try {
			const fullPath = path.join(workshopRoot, filePath)
			await handleFileSystemChange(event, fullPath)
			// Also update modified times for cache invalidation
			setModifiedTimesForAppDirs(fullPath)
		} catch (error) {
			console.error('Error handling file system change:', error)
		}
	})
	
	closeWithGrace(() => watcher.close())
}

/**
 * Handle file system changes and update virtual file system
 */
async function handleFileSystemChange(event: string, fullPath: string): Promise<void> {
	const workshopRoot = getWorkshopRoot()
	const relativePath = path.relative(workshopRoot, fullPath)
	const pathParts = relativePath.split(path.sep)
	
	// Determine which root directory this change affects
	const rootDir = pathParts[0]
	
	if (rootDir === 'exercises' || rootDir === 'examples') {
		// Rebuild the entire virtual file system for simplicity
		// This ensures consistency and handles complex scenarios like directory moves
		await buildVirtualFileSystem()
	}
}

/**
 * Check if a directory is empty using the virtual file system
 */
export async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
	await initializeVirtualFileSystem()
	
	const workshopRoot = getWorkshopRoot()
	const relativePath = path.relative(workshopRoot, dirPath)
	const pathParts = relativePath.split(path.sep)
	
	// Handle exercises directory
	if (pathParts[0] === 'exercises') {
		if (pathParts.length === 1) {
			// Check if exercises directory is empty
			return virtualFileSystem.exercises.size === 0
		} else if (pathParts.length === 2 && pathParts[1]) {
			// Check if specific exercise directory is empty
			const exerciseNode = virtualFileSystem.exercises.get(pathParts[1])
			if (!exerciseNode || exerciseNode.type !== 'directory') return true
			return !exerciseNode.children || exerciseNode.children.size === 0
		} else if (pathParts.length === 3 && pathParts[1] && pathParts[2]) {
			// Check if specific exercise step directory is empty
			const exerciseNode = virtualFileSystem.exercises.get(pathParts[1])
			if (!exerciseNode || exerciseNode.type !== 'directory' || !exerciseNode.children) return true
			const stepNode = exerciseNode.children.get(pathParts[2])
			if (!stepNode || stepNode.type !== 'directory') return true
			return !stepNode.children || stepNode.children.size === 0
		}
	}
	
	// Handle examples directory
	if (pathParts[0] === 'examples') {
		if (pathParts.length === 1) {
			// Check if examples directory is empty
			return virtualFileSystem.examples.size === 0
		} else if (pathParts.length === 2 && pathParts[1]) {
			// Check if specific example directory is empty
			const exampleNode = virtualFileSystem.examples.get(pathParts[1])
			if (!exampleNode || exampleNode.type !== 'directory') return true
			return !exampleNode.children || exampleNode.children.size === 0
		}
	}
	
	// For paths outside our virtual file system, fall back to actual file system
	return await isDirectoryEmptyFallback(dirPath)
}

/**
 * Get directory contents using the virtual file system
 */
export async function getDirectoryContents(dirPath: string): Promise<string[]> {
	await initializeVirtualFileSystem()
	
	const workshopRoot = getWorkshopRoot()
	const relativePath = path.relative(workshopRoot, dirPath)
	const pathParts = relativePath.split(path.sep)
	
	// Handle exercises directory
	if (pathParts[0] === 'exercises') {
		if (pathParts.length === 1) {
			// Return exercise directories
			return Array.from(virtualFileSystem.exercises.keys())
		} else if (pathParts.length === 2 && pathParts[1]) {
			// Return exercise step directories
			const exerciseNode = virtualFileSystem.exercises.get(pathParts[1])
			if (!exerciseNode || exerciseNode.type !== 'directory' || !exerciseNode.children) return []
			return Array.from(exerciseNode.children.keys())
		} else if (pathParts.length === 3 && pathParts[1] && pathParts[2]) {
			// Return exercise step contents
			const exerciseNode = virtualFileSystem.exercises.get(pathParts[1])
			if (!exerciseNode || exerciseNode.type !== 'directory' || !exerciseNode.children) return []
			const stepNode = exerciseNode.children.get(pathParts[2])
			if (!stepNode || stepNode.type !== 'directory' || !stepNode.children) return []
			return Array.from(stepNode.children.keys())
		}
	}
	
	// Handle examples directory
	if (pathParts[0] === 'examples') {
		if (pathParts.length === 1) {
			// Return example directories
			return Array.from(virtualFileSystem.examples.keys())
		} else if (pathParts.length === 2 && pathParts[1]) {
			// Return example directory contents
			const exampleNode = virtualFileSystem.examples.get(pathParts[1])
			if (!exampleNode || exampleNode.type !== 'directory' || !exampleNode.children) return []
			return Array.from(exampleNode.children.keys())
		}
	}
	
	// For paths outside our virtual file system, fall back to actual file system
	return await readDir(dirPath)
}

/**
 * Check if a path exists in the virtual file system
 */
export async function pathExists(targetPath: string): Promise<boolean> {
	await initializeVirtualFileSystem()
	
	const workshopRoot = getWorkshopRoot()
	const relativePath = path.relative(workshopRoot, targetPath)
	const pathParts = relativePath.split(path.sep)
	
	// Handle exercises directory
	if (pathParts[0] === 'exercises') {
		if (pathParts.length === 1) {
			return true // exercises directory always exists in our virtual system
		} else if (pathParts.length === 2 && pathParts[1]) {
			return virtualFileSystem.exercises.has(pathParts[1])
		} else if (pathParts.length === 3 && pathParts[1] && pathParts[2]) {
			const exerciseNode = virtualFileSystem.exercises.get(pathParts[1])
			if (!exerciseNode || exerciseNode.type !== 'directory' || !exerciseNode.children) return false
			return exerciseNode.children.has(pathParts[2])
		}
	}
	
	// Handle examples directory
	if (pathParts[0] === 'examples') {
		if (pathParts.length === 1) {
			return true // examples directory always exists in our virtual system
		} else if (pathParts.length === 2 && pathParts[1]) {
			return virtualFileSystem.examples.has(pathParts[1])
		}
	}
	
	// For paths outside our virtual file system, fall back to actual file system
	return await exists(targetPath)
}

/**
 * Get the virtual file system state (for debugging)
 */
export async function getVirtualFileSystemState(): Promise<VirtualFileSystem> {
	await initializeVirtualFileSystem()
	return virtualFileSystem
}

/**
 * Force refresh the virtual file system
 */
export async function refreshVirtualFileSystem(): Promise<void> {
	await buildVirtualFileSystem()
}

/**
 * Set modified times for app directories and refresh virtual file system if needed
 */
export function setModifiedTimesForAppDirs(...filePaths: Array<string>) {
	const now = Date.now()
	let shouldRefreshVirtualFS = false
	
	for (const filePath of filePaths) {
		const appDir = getAppPathFromFilePath(filePath)
		if (appDir) {
			modifiedTimes.set(appDir, now)
		}
		
		// Check if this change affects exercises or examples directories
		const relativePath = path.relative(getWorkshopRoot(), filePath)
		const pathParts = relativePath.split(path.sep)
		if (pathParts[0] === 'exercises' || pathParts[0] === 'examples') {
			shouldRefreshVirtualFS = true
		}
	}
	
	// Refresh virtual file system if needed
	if (shouldRefreshVirtualFS) {
		refreshVirtualFileSystem().catch((error) => {
			console.error('Failed to refresh virtual file system:', error)
		})
	}
}

/**
 * Get force fresh value for cache entries based on directory modification times
 */
export function getForceFreshForDir(
	cacheEntry: CacheEntry | null | undefined,
	...dirs: Array<string | undefined | null>
) {
	const truthyDirs = dirs.filter(Boolean)
	for (const d of truthyDirs) {
		if (!path.isAbsolute(d)) {
			throw new Error(`Trying to get force fresh for non-absolute path: ${d}`)
		}
	}
	if (!cacheEntry) return true
	const latestModifiedTime = truthyDirs.reduce((latest, dir) => {
		const modifiedTime = modifiedTimes.get(dir)
		return modifiedTime && modifiedTime > latest ? modifiedTime : latest
	}, 0)
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > cacheEntry.metadata.createdTime ? true : undefined
}

/**
 * Get force fresh value for cache entries based on global modification times
 */
export function getForceFresh(cacheEntry: CacheEntry | null | undefined) {
	if (!cacheEntry) return true
	const latestModifiedTime = Math.max(...Array.from(modifiedTimes.values()))
	if (!latestModifiedTime) return undefined
	return latestModifiedTime > cacheEntry.metadata.createdTime ? true : undefined
}

/**
 * Get app path from file path for modified time tracking
 */
export function getAppPathFromFilePath(filePath: string): string | null {
	const [, withinWorkshopRootHalf] = filePath.split(getWorkshopRoot())
	if (!withinWorkshopRootHalf) {
		return null
	}

	const [part1, part2, part3] = withinWorkshopRootHalf
		.split(path.sep)
		.filter(Boolean)

	// Check if the file is in the playground
	if (part1 === 'playground') {
		return path.join(getWorkshopRoot(), 'playground')
	}

	// Check if the file is in an example
	if (part1 === 'examples' && part2) {
		return path.join(getWorkshopRoot(), 'examples', part2)
	}

	// Check if the file is in an exercise
	if (part1 === 'exercises' && part2 && part3) {
		return path.join(getWorkshopRoot(), 'exercises', part2, part3)
	}

	// If we couldn't determine the app path, return null
	return null
}

// Helper functions

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath)
		return true
	} catch {
		return false
	}
}

async function readDir(dirPath: string): Promise<string[]> {
	try {
		return await fs.promises.readdir(dirPath)
	} catch {
		return []
	}
}

async function isDirectoryEmptyFallback(dirPath: string): Promise<boolean> {
	try {
		const files = await fs.promises.readdir(dirPath)
		if (files.length === 0) return true
		
		const isIgnored = await isGitIgnored({ cwd: dirPath })
		const nonIgnoredFiles = files.filter((file) => !isIgnored(file))
		return nonIgnoredFiles.length === 0
	} catch {
		return true
	}
}

// Initialize on module load
if (!ENV.EPICSHOP_DEPLOYED && process.env.EPICSHOP_ENABLE_WATCHER === 'true') {
	// Initialize in background
	initializeVirtualFileSystem().catch((error) => {
		console.error('Failed to initialize virtual file system on load:', error)
	})
}