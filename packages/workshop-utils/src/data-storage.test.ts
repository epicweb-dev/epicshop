import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

const envRef = { homeDir: '/mock/home/.epicshop' }

vi.mock('./init-env.js', () => ({
	getEnv: () => ({ EPICSHOP_HOME_DIR: envRef.homeDir }),
}))

import {
	resolvePrimaryDir,
	resolveCacheDir,
	migrateLegacyData,
} from './data-storage.server.js'

// Mock fs and os modules
vi.mock('node:fs', () => ({
	promises: {
		stat: vi.fn(),
		mkdir: vi.fn(),
		chmod: vi.fn(),
		rename: vi.fn(),
		rmdir: vi.fn(),
		readdir: vi.fn(),
	},
}))

vi.mock('node:os', () => ({
	homedir: vi.fn(() => '/mock/home'),
}))

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)

beforeEach(() => {
	vi.clearAllMocks()
	mockOs.homedir.mockReturnValue('/mock/home')
	envRef.homeDir = '/mock/home/.epicshop'
})

afterEach(() => {
	vi.restoreAllMocks()
})

function withPlatform(
	platform: string,
	envVars: Record<string, string | undefined> = {},
) {
	const originalPlatform = process.platform
	const originalEnvVars: Record<string, string | undefined> = {}

	// Store original environment variables
	for (const key of Object.keys(envVars)) {
		originalEnvVars[key] = process.env[key]
	}

	// Set platform and environment variables
	Object.defineProperty(process, 'platform', { value: platform })
	for (const [key, value] of Object.entries(envVars)) {
		if (value === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = value
		}
	}

	return {
		[Symbol.dispose]() {
			// Restore original platform
			Object.defineProperty(process, 'platform', { value: originalPlatform })

			// Restore original environment variables
			for (const [key, originalValue] of Object.entries(originalEnvVars)) {
				if (originalValue === undefined) {
					delete process.env[key]
				} else {
					process.env[key] = originalValue
				}
			}
		},
	}
}

test('resolvePrimaryDir returns correct path for darwin', () => {
	envRef.homeDir = ''
	using _ = withPlatform('darwin')

	const result = resolvePrimaryDir()
	expect(result).toBe('/mock/home/Library/Application Support/epicshop')
})

test('resolvePrimaryDir returns correct path for win32', () => {
	envRef.homeDir = ''
	using _ = withPlatform('win32', {
		LOCALAPPDATA: undefined,
		APPDATA: undefined,
	})

	const result = resolvePrimaryDir()
	expect(result).toBe('/mock/home/AppData/Local/epicshop')
})

test('resolvePrimaryDir returns correct path for linux', () => {
	envRef.homeDir = ''
	using _ = withPlatform('linux', {
		XDG_STATE_HOME: undefined,
	})

	const result = resolvePrimaryDir()
	expect(result).toBe('/mock/home/.local/state/epicshop')
})

test('resolvePrimaryDir uses EPICSHOP_HOME_DIR override when provided', () => {
	envRef.homeDir = '/custom/epicshop'
	using _ = withPlatform('linux', {
		EPICSHOP_HOME_DIR: '/custom/epicshop',
	})

	const result = resolvePrimaryDir()
	expect(result).toBe('/custom/epicshop')
})

test('resolveCacheDir returns correct path for darwin', () => {
	envRef.homeDir = ''
	using _ = withPlatform('darwin')

	const result = resolveCacheDir()
	expect(result).toBe('/mock/home/Library/Caches/epicshop')
})

test('resolveCacheDir returns correct path for win32', () => {
	envRef.homeDir = ''
	using _ = withPlatform('win32', {
		LOCALAPPDATA: undefined,
		APPDATA: undefined,
	})

	const result = resolveCacheDir()
	expect(result).toBe('/mock/home/AppData/Local/epicshop/Cache')
})

test('resolveCacheDir returns correct path for linux', () => {
	envRef.homeDir = ''
	using _ = withPlatform('linux', {
		XDG_CACHE_HOME: undefined,
	})

	const result = resolveCacheDir()
	expect(result).toBe('/mock/home/.cache/epicshop')
})

test('resolveCacheDir uses EPICSHOP_HOME_DIR override when provided', () => {
	envRef.homeDir = '/custom/epicshop'
	using _ = withPlatform('linux', {
		EPICSHOP_HOME_DIR: '/custom/epicshop',
	})

	const result = resolveCacheDir()
	expect(result).toBe('/custom/epicshop/cache')
})

test('migrateLegacyData successfully migrates both data and cache on darwin', async () => {
	using _ = withPlatform('darwin')

	const legacyDataPath = '/mock/home/.epicshop/data.json'
	const legacyCachePath = '/mock/home/.epicshop/cache'
	const primaryDataPath =
		'/mock/home/Library/Application Support/epicshop/data.json'
	const primaryCachePath = '/mock/home/Library/Caches/epicshop'

	// Mock directory exists
	mockFs.stat
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // legacyDir
		.mockResolvedValueOnce({ isFile: () => true } as any) // data file
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // cache dir

	mockFs.mkdir.mockResolvedValue(undefined)
	mockFs.rename.mockResolvedValue(undefined)
	mockFs.chmod.mockResolvedValue(undefined)
	mockFs.readdir.mockResolvedValue([]) // empty directory
	mockFs.rmdir.mockResolvedValue(undefined)

	await migrateLegacyData()

	expect(mockFs.rename).toHaveBeenCalledWith(legacyDataPath, primaryDataPath)
	expect(mockFs.rename).toHaveBeenCalledWith(legacyCachePath, primaryCachePath)
	expect(mockFs.rmdir).toHaveBeenCalledWith('/mock/home/.epicshop')
})

test('migrateLegacyData successfully migrates both data and cache on win32', async () => {
	using _ = withPlatform('win32', {
		LOCALAPPDATA: undefined,
		APPDATA: undefined,
	})

	const legacyDataPath = '/mock/home/.epicshop/data.json'
	const legacyCachePath = '/mock/home/.epicshop/cache'
	const primaryDataPath = '/mock/home/AppData/Local/epicshop/data.json'
	const primaryCachePath = '/mock/home/AppData/Local/epicshop/Cache'

	// Mock directory exists
	mockFs.stat
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // legacyDir
		.mockResolvedValueOnce({ isFile: () => true } as any) // data file
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // cache dir

	mockFs.mkdir.mockResolvedValue(undefined)
	mockFs.rename.mockResolvedValue(undefined)
	mockFs.chmod.mockResolvedValue(undefined)
	mockFs.readdir.mockResolvedValue([]) // empty directory
	mockFs.rmdir.mockResolvedValue(undefined)

	await migrateLegacyData()

	expect(mockFs.rename).toHaveBeenCalledWith(legacyDataPath, primaryDataPath)
	expect(mockFs.rename).toHaveBeenCalledWith(legacyCachePath, primaryCachePath)
	expect(mockFs.rmdir).toHaveBeenCalledWith('/mock/home/.epicshop')
})

test('migrateLegacyData successfully migrates both data and cache on linux', async () => {
	using _ = withPlatform('linux', {
		XDG_STATE_HOME: undefined,
		XDG_CACHE_HOME: undefined,
	})

	const legacyDataPath = '/mock/home/.epicshop/data.json'
	const legacyCachePath = '/mock/home/.epicshop/cache'
	const primaryDataPath = '/mock/home/.local/state/epicshop/data.json'
	const primaryCachePath = '/mock/home/.cache/epicshop'

	// Mock directory exists
	mockFs.stat
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // legacyDir
		.mockResolvedValueOnce({ isFile: () => true } as any) // data file
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // cache dir

	mockFs.mkdir.mockResolvedValue(undefined)
	mockFs.rename.mockResolvedValue(undefined)
	mockFs.chmod.mockResolvedValue(undefined)
	mockFs.readdir.mockResolvedValue([]) // empty directory
	mockFs.rmdir.mockResolvedValue(undefined)

	await migrateLegacyData()

	expect(mockFs.rename).toHaveBeenCalledWith(legacyDataPath, primaryDataPath)
	expect(mockFs.rename).toHaveBeenCalledWith(legacyCachePath, primaryCachePath)
	expect(mockFs.rmdir).toHaveBeenCalledWith('/mock/home/.epicshop')
})

test('migrateLegacyData handles missing legacy directory', async () => {
	mockFs.stat.mockRejectedValue({ code: 'ENOENT' })

	await migrateLegacyData()

	expect(mockFs.rename).not.toHaveBeenCalled()
	expect(mockFs.rmdir).not.toHaveBeenCalled()
})

test('migrateLegacyData handles permission errors gracefully', async () => {
	const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
	mockFs.stat.mockRejectedValue({ code: 'EACCES' })

	await migrateLegacyData()

	expect(consoleSpy).toHaveBeenCalledWith(
		expect.stringContaining('Legacy directory exists but is unreadable'),
	)
	consoleSpy.mockRestore()
})

test('migrateLegacyData removes legacy directory when empty', async () => {
	mockFs.stat
		.mockResolvedValueOnce({ isDirectory: () => true } as any) // legacyDir
		.mockResolvedValueOnce({ isFile: () => false } as any) // no data file
		.mockResolvedValueOnce({ isDirectory: () => false } as any) // no cache dir

	mockFs.readdir.mockResolvedValue([]) // empty directory
	mockFs.rmdir.mockResolvedValue(undefined)

	await migrateLegacyData()

	expect(mockFs.rmdir).toHaveBeenCalledWith('/mock/home/.epicshop')
})

/*
eslint
	@typescript-eslint/no-unused-vars: "off",
*/
