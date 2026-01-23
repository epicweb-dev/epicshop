import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('execa', () => ({
	execa: vi.fn(),
}))

const { execa } = await import('execa')
const {
	getInstallCommand,
	getRootPackageInstallStatus,
	getRootPackageJsonPaths,
	getWorkspaceInstallStatus,
} = await import('./package-install-check.server.ts')

let tempDir: string

beforeEach(async () => {
	tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'package-install-test-'))
	vi.mocked(execa).mockReset()
})

afterEach(async () => {
	await fs.rm(tempDir, { recursive: true, force: true })
})

async function writePackageJson(
	dir: string,
	content: {
		name?: string
		packageManager?: string
		dependencies?: Record<string, string>
		devDependencies?: Record<string, string>
		optionalDependencies?: Record<string, string>
		workspaces?: Array<string> | { packages: Array<string> }
	},
) {
	await fs.writeFile(
		path.join(dir, 'package.json'),
		JSON.stringify(content, null, 2),
	)
}

function mockNpmLsResult({
	exitCode,
	dependencies = {},
	stdout,
}: {
	exitCode: number
	dependencies?: Record<string, { missing?: boolean; invalid?: boolean }>
	stdout?: string
}) {
	vi.mocked(execa).mockResolvedValue({
		exitCode,
		stdout: stdout ?? JSON.stringify({ dependencies }),
		stderr: '',
	} as never)
}

describe('getInstallCommand', () => {
	test('returns npm command for npm package manager', () => {
		const result = getInstallCommand('npm')
		expect(result).toEqual({ command: 'npm', args: ['install'] })
	})

	test('returns pnpm command for pnpm package manager', () => {
		const result = getInstallCommand('pnpm')
		expect(result).toEqual({ command: 'pnpm', args: ['install'] })
	})

	test('returns yarn command for yarn package manager', () => {
		const result = getInstallCommand('yarn')
		expect(result).toEqual({ command: 'yarn', args: ['install'] })
	})

	test('returns bun command for bun package manager', () => {
		const result = getInstallCommand('bun')
		expect(result).toEqual({ command: 'bun', args: ['install'] })
	})

	test('returns npm command for null package manager', () => {
		const result = getInstallCommand(null)
		expect(result).toEqual({ command: 'npm', args: ['install'] })
	})

	test('returns npm command for unknown package manager', () => {
		const result = getInstallCommand('unknown')
		expect(result).toEqual({ command: 'npm', args: ['install'] })
	})
})

describe('getRootPackageInstallStatus', () => {
	test('detects npm package manager from packageManager field', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			packageManager: 'npm@10.0.0',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {} },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.packageManager).toBe('npm')
		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('up-to-date')
	})

	test('detects pnpm package manager from packageManager field', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			packageManager: 'pnpm@8.0.0',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {} },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.packageManager).toBe('pnpm')
		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('up-to-date')
	})

	test('detects yarn package manager from packageManager field', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			packageManager: 'yarn@4.0.0',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {} },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.packageManager).toBe('yarn')
		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('up-to-date')
	})

	test('detects bun package manager from packageManager field', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			packageManager: 'bun@1.0.0',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {} },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.packageManager).toBe('bun')
		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('up-to-date')
	})

	test('returns null package manager when not specified', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {} },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.packageManager).toBeNull()
		expect(status.dependenciesNeedInstall).toBe(false)
	})

	test('detects missing node_modules directory', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 1,
			stdout: '',
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(true)
		expect(status.reason).toBe('missing-dependencies')
		expect(status.missingDependencies).toEqual(['react'])
	})

	test('detects missing dependencies', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 1,
			dependencies: {
				react: {},
				'react-dom': { missing: true },
			},
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(true)
		expect(status.reason).toBe('missing-dependencies')
		expect(status.missingDependencies).toEqual(['react-dom'])
		expect(execa).toHaveBeenCalledWith(
			'npm',
			['ls', '--depth=0', '--json', 'react', 'react-dom'],
			expect.objectContaining({ cwd: tempDir, reject: false }),
		)
	})

	test('detects missing devDependencies', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { react: '^18.0.0' },
			devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
		})
		mockNpmLsResult({
			exitCode: 1,
			dependencies: {
				react: {},
				typescript: {},
				vitest: { missing: true },
			},
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(true)
		expect(status.reason).toBe('missing-dependencies')
		expect(status.missingDevDependencies).toEqual(['vitest'])
	})

	test('handles scoped packages correctly', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { '@epic-web/workshop-utils': '^1.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { '@epic-web/workshop-utils': {} },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('up-to-date')
	})

	test('detects missing scoped packages', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { '@epic-web/workshop-utils': '^1.0.0' },
		})
		mockNpmLsResult({
			exitCode: 1,
			dependencies: { '@epic-web/workshop-utils': { missing: true } },
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(true)
		expect(status.missingDependencies).toEqual(['@epic-web/workshop-utils'])
	})

	test('handles package.json with no dependencies', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('up-to-date')
		expect(status.missingDependencies).toEqual([])
	})

	test('handles missing optionalDependencies gracefully', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { react: '^18.0.0' },
			optionalDependencies: { 'optional-pkg': '^1.0.0' },
		})
		mockNpmLsResult({
			exitCode: 1,
			dependencies: {
				react: {},
				'optional-pkg': { missing: true },
			},
		})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		// Missing optional dependencies should not trigger install requirement
		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.missingOptionalDependencies).toEqual(['optional-pkg'])
	})

	test('handles unreadable package.json', async () => {
		vi.mocked(console.warn).mockImplementation(() => {})

		const status = await getRootPackageInstallStatus(
			path.join(tempDir, 'nonexistent', 'package.json'),
		)

		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.reason).toBe('package-json-unreadable')
		expect(status.packageManager).toBeNull()
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining('Failed to read package.json'),
			expect.any(String),
		)
	})

	test('generates consistent dependency hash', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {}, 'react-dom': {} },
		})

		const status1 = await getRootPackageInstallStatus(
			path.join(tempDir, 'package.json'),
		)

		// Create a second temp directory with the same dependencies
		const tempDir2 = await fs.mkdtemp(
			path.join(os.tmpdir(), 'package-install-test-'),
		)
		try {
			await writePackageJson(tempDir2, {
				name: 'different-name',
				dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
			})
			mockNpmLsResult({
				exitCode: 0,
				dependencies: { react: {}, 'react-dom': {} },
			})

			const status2 = await getRootPackageInstallStatus(
				path.join(tempDir2, 'package.json'),
			)

			expect(status1.dependencyHash).toBe(status2.dependencyHash)
		} finally {
			await fs.rm(tempDir2, { recursive: true, force: true })
		}
	})
})

describe('getRootPackageJsonPaths', () => {
	test('finds single root package.json', async () => {
		await writePackageJson(tempDir, {
			name: 'root-package',
		})

		const paths = await getRootPackageJsonPaths(tempDir)

		expect(paths).toHaveLength(1)
		expect(paths[0]).toBe(path.resolve(tempDir, 'package.json'))
	})

	test('excludes workspace member package.json files', async () => {
		await writePackageJson(tempDir, {
			name: 'root-package',
			workspaces: ['packages/*'],
		})

		const packagesDir = path.join(tempDir, 'packages')
		await fs.mkdir(packagesDir, { recursive: true })

		const pkg1Dir = path.join(packagesDir, 'pkg1')
		await fs.mkdir(pkg1Dir, { recursive: true })
		await writePackageJson(pkg1Dir, {
			name: 'pkg1',
		})

		const paths = await getRootPackageJsonPaths(tempDir)

		expect(paths).toHaveLength(1)
		expect(paths[0]).toBe(path.resolve(tempDir, 'package.json'))
	})

	test('finds multiple independent roots', async () => {
		await writePackageJson(tempDir, {
			name: 'root-package',
		})

		const subDir = path.join(tempDir, 'sub')
		await fs.mkdir(subDir, { recursive: true })
		await writePackageJson(subDir, {
			name: 'sub-package',
		})

		const paths = await getRootPackageJsonPaths(tempDir)

		expect(paths).toHaveLength(2)
		expect(paths).toContain(path.resolve(tempDir, 'package.json'))
		expect(paths).toContain(path.resolve(subDir, 'package.json'))
	})

	test('handles workspaces defined as object', async () => {
		await writePackageJson(tempDir, {
			name: 'root-package',
			workspaces: {
				packages: ['apps/*'],
			},
		})

		const appsDir = path.join(tempDir, 'apps')
		await fs.mkdir(appsDir, { recursive: true })

		const app1Dir = path.join(appsDir, 'app1')
		await fs.mkdir(app1Dir, { recursive: true })
		await writePackageJson(app1Dir, {
			name: 'app1',
		})

		const paths = await getRootPackageJsonPaths(tempDir)

		expect(paths).toHaveLength(1)
		expect(paths[0]).toBe(path.resolve(tempDir, 'package.json'))
	})
})

describe('getWorkspaceInstallStatus', () => {
	test('aggregates status for single root', async () => {
		await writePackageJson(tempDir, {
			name: 'test-package',
			packageManager: 'pnpm@8.0.0',
			dependencies: { react: '^18.0.0' },
		})
		mockNpmLsResult({
			exitCode: 0,
			dependencies: { react: {} },
		})

		const status = await getWorkspaceInstallStatus(tempDir)

		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.roots).toHaveLength(1)
		expect(status.roots[0]?.packageManager).toBe('pnpm')
		expect(status.dependencyHash).toBeTruthy()
	})

	test('detects install needed in workspace with multiple roots', async () => {
		await writePackageJson(tempDir, {
			name: 'root-package',
			dependencies: { react: '^18.0.0' },
		})

		const subDir = path.join(tempDir, 'sub')
		await fs.mkdir(subDir, { recursive: true })
		await writePackageJson(subDir, {
			name: 'sub-package',
			dependencies: { typescript: '^5.0.0' },
		})

		vi.mocked(execa).mockImplementation(async (_command, _args, options) => {
			const cwd = (options as { cwd?: string }).cwd
			if (cwd === tempDir) {
				return {
					exitCode: 0,
					stdout: JSON.stringify({ dependencies: { react: {} } }),
					stderr: '',
				} as never
			}
			if (cwd === subDir) {
				return {
					exitCode: 1,
					stdout: JSON.stringify({
						dependencies: { typescript: { missing: true } },
					}),
					stderr: '',
				} as never
			}
			return { exitCode: 1, stdout: '', stderr: '' } as never
		})

		const status = await getWorkspaceInstallStatus(tempDir)

		expect(status.dependenciesNeedInstall).toBe(true)
		expect(status.roots).toHaveLength(2)
		expect(status.roots[0]?.dependenciesNeedInstall).toBe(false)
		expect(status.roots[1]?.dependenciesNeedInstall).toBe(true)
	})

	test('returns all up-to-date when all roots satisfied', async () => {
		await writePackageJson(tempDir, {
			name: 'root-package',
			packageManager: 'yarn@4.0.0',
			dependencies: { react: '^18.0.0' },
		})
		vi.mocked(execa)
			.mockResolvedValueOnce({
				exitCode: 0,
				stdout: JSON.stringify({ dependencies: { react: {} } }),
				stderr: '',
			} as never)
			.mockResolvedValueOnce({
				exitCode: 0,
				stdout: JSON.stringify({ dependencies: { typescript: {} } }),
				stderr: '',
			} as never)

		const subDir = path.join(tempDir, 'sub')
		await fs.mkdir(subDir, { recursive: true })
		await writePackageJson(subDir, {
			name: 'sub-package',
			packageManager: 'bun@1.0.0',
			dependencies: { typescript: '^5.0.0' },
		})

		const status = await getWorkspaceInstallStatus(tempDir)

		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.roots).toHaveLength(2)
		expect(status.roots[0]?.packageManager).toBe('yarn')
		expect(status.roots[1]?.packageManager).toBe('bun')
	})

	test('handles empty workspace', async () => {
		const status = await getWorkspaceInstallStatus(tempDir)

		expect(status.dependenciesNeedInstall).toBe(false)
		expect(status.roots).toHaveLength(0)
		expect(status.dependencyHash).toBeNull()
	})
})
