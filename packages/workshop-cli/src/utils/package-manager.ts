import { type PackageManager } from '@epic-web/workshop-utils/workshops.server'

function detectPackageManager(value: string): PackageManager | null {
	if (!value) return null
	if (value.includes('pnpm')) return 'pnpm'
	if (value.includes('yarn')) return 'yarn'
	if (value.includes('bun')) return 'bun'
	if (value.includes('npm')) return 'npm'
	return null
}

export function detectRuntimePackageManager(): PackageManager | null {
	const userAgent = (process.env.npm_config_user_agent ?? '').toLowerCase()
	const execPath = (process.env.npm_execpath ?? '').toLowerCase()

	return detectPackageManager(userAgent) ?? detectPackageManager(execPath)
}

export function getPackageManagerInstallArgs(
	_packageManager: PackageManager,
): string[] {
	return ['install']
}

export function getPackageManagerRunArgs(
	_packageManager: PackageManager,
	script: string,
): string[] {
	return ['run', script]
}

export function formatPackageManagerCommand(
	packageManager: PackageManager,
	args: string[],
): string {
	return `${packageManager} ${args.join(' ')}`.trim()
}
