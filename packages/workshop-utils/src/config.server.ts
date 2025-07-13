import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import dns from 'node:dns'
import { z } from 'zod'
import { handleGitHubRepoAndRoot } from './utils.js'

const dnsLookup = promisify(dns.lookup)

export const getWorkshopRoot = () =>
	process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()

const getRootPkgJsonPath = () => path.join(getWorkshopRoot(), 'package.json')

// Cache for subdomain resolution check
const subdomainResolutionCache: {
	checked: boolean
	supportsSubdomains: boolean
	checkPromise?: Promise<boolean>
} = {
	checked: false,
	supportsSubdomains: false,
}

/**
 * Check if the system supports subdomain resolution on localhost
 * This check only happens once on startup by attempting to resolve a test subdomain
 */
async function checkSubdomainSupport(): Promise<boolean> {
	if (subdomainResolutionCache.checked) {
		return subdomainResolutionCache.supportsSubdomains
	}

	// If a check is already in progress, return that promise
	if (subdomainResolutionCache.checkPromise) {
		return subdomainResolutionCache.checkPromise
	}

	// Start the check and cache the promise
	subdomainResolutionCache.checkPromise = (async () => {
		try {
			// Try to resolve a test subdomain
			// We use 'test.localhost' as it's a safe test domain
			await dnsLookup('test.localhost')
			subdomainResolutionCache.supportsSubdomains = true
		} catch (error: any) {
			// If the error is ENOTFOUND or any other DNS error, 
			// subdomain resolution likely isn't supported
			subdomainResolutionCache.supportsSubdomains = false
		}

		subdomainResolutionCache.checked = true
		return subdomainResolutionCache.supportsSubdomains
	})()

	return subdomainResolutionCache.checkPromise
}

export const StackBlitzConfigSchema = z.object({
	// we default this to `${exerciseTitle} (${type})`
	title: z.string().optional(),
	// stackblitz defaults this to dev automatically
	startScript: z.string().optional(),
	// if no value is provided, then stackblitz defaults this to whatever
	// looks best based on the width of the screen
	view: z
		.union([z.literal('editor'), z.literal('preview'), z.literal('both')])
		.optional(),
	file: z.string().optional(),
	hidedevtools: z.string().optional(),
	terminalHeight: z.string().optional(),
	hideNavigation: z.string().optional(),
})

const InstructorSchema = z.object({
	name: z.string().optional(),
	avatar: z.string().optional(),
	𝕏: z.string().optional(),
	xHandle: z.string().optional(),
})

// most defaults are for backwards compatibility
const WorkshopConfigSchema = z
	.object({
		title: z.string(),
		subtitle: z.string().optional(),
		instructor: InstructorSchema.optional(),
		epicWorkshopHost: z.string().optional(),
		epicWorkshopSlug: z.string().optional(),
		subdomain: z.string().optional(),
		product: z
			.object({
				host: z.string().default('www.epicweb.dev'),
				displayName: z.string().default('EpicWeb.dev'),
				displayNameShort: z.string().default('Epic Web'),
				logo: z.string().default('/logo.svg'),
				slug: z.string().optional(),
				discordChannelId: z.string().default('1161045224907341972'),
				discordTags: z.array(z.string()).optional(),
			})
			.default({}),
		onboardingVideo: z
			.string()
			.default(
				'https://www.epicweb.dev/tips/get-started-with-the-epic-workshop-app',
			),
		githubRepo: z
			.string()
			.transform((githubRepo) => githubRepo ?? ENV.EPICSHOP_GITHUB_REPO),
		githubRoot: z
			.string()
			.transform((githubRoot) => githubRoot ?? ENV.EPICSHOP_GITHUB_ROOT),
		stackBlitzConfig: StackBlitzConfigSchema.optional(),
		forms: z
			.object({
				workshop: z
					.string()
					.default(
						'https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}',
					),
				exercise: z
					.string()
					.default(
						'https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}',
					),
			})
			.default({}),
		testTab: z
			.object({
				enabled: z.boolean().default(true),
			})
			.default({}),
		scripts: z
			.object({
				postupdate: z.string().optional(),
			})
			.optional(),
		initialRoute: z.string().optional().default('/'),
		notifications: z
			.array(
				z.object({
					id: z.string(),
					title: z.string(),
					message: z.string(),
					link: z.string().optional(),
					type: z.enum(['info', 'warning', 'danger']),
					expiresAt: z.date().nullable(),
				}),
			)
			.optional()
			.default([]),
	})
	.transform((data) => {
		return {
			...data,
			product: {
				...data.product,
				displayNameShort:
					data.product.displayNameShort ?? data.product.displayName,
				// for backwards compatibility
				host: data.product.host ?? data.epicWorkshopHost,
				slug: data.product.slug ?? data.epicWorkshopSlug,
			},
		}
	})

export type WorkshopConfig = z.infer<typeof WorkshopConfigSchema>

const configCache: {
	config: WorkshopConfig | null
	modified: number
} = {
	config: null,
	modified: 0,
}

// Utility to read and parse the root package.json
function readRootPkgJson(): any {
	const packageJsonPath = getRootPkgJsonPath()
	try {
		const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
		return JSON.parse(packageJsonContent)
	} catch (error) {
		console.error(`Error reading or parsing package.json:`, error)
		if (error instanceof Error && error.message.includes('ENOENT')) {
			throw new Error(
				`package.json not found at ${packageJsonPath}. Please ensure you're running the command from the correct directory.`,
			)
		} else if (error instanceof SyntaxError) {
			throw new Error(
				`Invalid JSON in package.json at ${packageJsonPath}. Please check the file for syntax errors.`,
			)
		}
		throw new Error(
			`Could not find and parse package.json at ${packageJsonPath}`,
		)
	}
}

/**
 * Generate a URL with subdomain support
 * Only applies subdomain logic when not deployed
 */
export async function getWorkshopUrl(port: number, subdomain?: string): Promise<string> {
	// Check if deployed - use process.env directly since ENV might not be initialized yet
	const isDeployed =
		process.env.EPICSHOP_DEPLOYED === 'true' ||
		process.env.EPICSHOP_DEPLOYED === '1'

	// Only use subdomain logic when not deployed
	if (!isDeployed) {
		const config = getWorkshopConfig()
		let subdomainToUse = subdomain ?? config.subdomain

		// Fallback to package.json name if subdomain is not set
		if (!subdomainToUse) {
			try {
				const packageJson = readRootPkgJson()
				if (
					packageJson &&
					typeof packageJson === 'object' &&
					'name' in packageJson &&
					typeof packageJson.name === 'string'
				) {
					let name = packageJson.name as string
					// Sanitize: lowercased, non-alphanumeric to dashes, trim dashes
					subdomainToUse = name
						.toLowerCase()
						.replace(/[^a-z0-9-]/g, '-')
						.replace(/^-+|-+$/g, '')
				}
			} catch {
				// ignore, fallback to localhost
			}
		}

		if (subdomainToUse) {
			const supportsSubdomains = await checkSubdomainSupport()
			if (supportsSubdomains) {
				return `http://${subdomainToUse}.localhost:${port}`
			}
		}
	}

	return `http://localhost:${port}`
}

export function getWorkshopConfig(): WorkshopConfig {
	if (
		configCache.config &&
		configCache.modified > fs.statSync(getRootPkgJsonPath()).mtimeMs
	) {
		return configCache.config
	}

	const packageJson = readRootPkgJson()

	const epicshopConfig = packageJson.epicshop || {}

	// Set githubRepo and githubRoot before parsing
	const { githubRepo, githubRoot } = handleGitHubRepoAndRoot({
		githubRepo: epicshopConfig.githubRepo,
		githubRoot: epicshopConfig.githubRoot,
	})
	epicshopConfig.githubRepo = githubRepo
	epicshopConfig.githubRoot = githubRoot

	try {
		const parsedConfig = WorkshopConfigSchema.parse(epicshopConfig)
		configCache.config = parsedConfig
		configCache.modified = fs.statSync(getRootPkgJsonPath()).mtimeMs
		return parsedConfig
	} catch (error) {
		if (error instanceof z.ZodError) {
			const flattenedErrors = error.flatten()
			const errorMessages = Object.entries(flattenedErrors.fieldErrors)
				.map(([field, errors]) => `${field}: ${errors?.join(', ')}`)
				.concat(flattenedErrors.formErrors)
			throw new Error(
				`Invalid epicshop configuration in ${getRootPkgJsonPath()}:\n${errorMessages.join('\n')}`,
			)
		}
		throw error
	}
}

export async function getStackBlitzUrl({
	fullPath,
	title,
	type,
}: {
	fullPath: string
	title: string
	type: string
}) {
	const workshopConfig = getWorkshopConfig()
	const appConfig = await getAppConfig(fullPath)

	if (appConfig.stackBlitzConfig === null) return null

	let githubRootUrlString = workshopConfig.githubRoot

	const githubRootUrl = new URL(
		githubRootUrlString.replace(/\/blob\//, '/tree/'),
	)

	const githubPart = githubRootUrl.pathname

	// Check if package.json exists to determine if this is a simple exercise
	const packageJsonPath = path.join(fullPath, 'package.json')
	const packageJsonExists = await fs.promises
		.access(packageJsonPath, fs.constants.F_OK)
		.then(() => true)
		.catch(() => false)

	let stackBlitzConfig = {
		...appConfig.stackBlitzConfig,
		title: appConfig.stackBlitzConfig?.title ?? `${title} (${type})`,
	}

	// For simple exercises without package.json, configure StackBlitz to show only editor
	if (!packageJsonExists) {
		// Find the first existing file from the priority list
		const priorityFiles = [
			'index.html',
			'index.tsx',
			'index.ts',
			'index.jsx',
			'index.js',
			'README.mdx',
			'README.md',
		]

		let defaultFile: string | null = null
		for (const fileName of priorityFiles) {
			const filePath = path.join(fullPath, fileName)
			try {
				await fs.promises.access(filePath, fs.constants.F_OK)
				defaultFile = fileName
				break
			} catch {
				continue
			}
		}

		stackBlitzConfig = {
			...stackBlitzConfig,
			view: 'editor', // Show only editor, no preview or terminal
			hidedevtools: '1', // Hide the console/devtools
			terminalHeight: '0', // Hide the terminal completely
			hideNavigation: '1', // Hide the preview's URL bar
			...(defaultFile && { file: defaultFile }), // Set default file if found
		}
	}

	const params = new URLSearchParams(stackBlitzConfig as Record<string, string>)

	const relativePath = fullPath.replace(`${getWorkshopRoot()}${path.sep}`, '')

	const stackBlitzUrl = new URL(
		`/github${githubPart}/${relativePath}?${params}`,
		'https://stackblitz.com',
	)

	return stackBlitzUrl.toString()
}

export async function getAppConfig(fullPath: string) {
	const workshopConfig = getWorkshopConfig()

	let epicshopConfig: Record<string, any> = {}
	let scripts: Record<string, string> = {}

	const packageJsonPath = path.join(fullPath, 'package.json')
	const packageJsonExists = await fs.promises
		.access(packageJsonPath, fs.constants.F_OK)
		.then(() => true)
		.catch(() => false)

	if (packageJsonExists) {
		const pkg = JSON.parse(
			await fs.promises.readFile(path.join(fullPath, 'package.json'), 'utf8'),
		) as any
		epicshopConfig = pkg.epicshop ?? {}
		scripts = pkg.scripts ?? {}
	}

	const AppConfigSchema = z.object({
		stackBlitzConfig: StackBlitzConfigSchema.nullable()
			.optional()
			.transform((appStackBlitzConfig) => {
				if (appStackBlitzConfig === null) return null

				return {
					...workshopConfig.stackBlitzConfig,
					...appStackBlitzConfig,
				}
			}),
		testTab: z
			.object({
				enabled: z
					.boolean()
					.optional()
					.default(workshopConfig.testTab?.enabled ?? true),
			})
			.default({}),
		scripts: z
			.object({
				test: z.string().optional(),
				dev: z.string().optional(),
			})
			.default({}),
		initialRoute: z.string().optional().default(workshopConfig.initialRoute),
	})

	const appConfig = {
		stackBlitzConfig: epicshopConfig.stackBlitzConfig,
		testTab: {
			enabled: epicshopConfig.testTab?.enabled,
		},
		scripts: {
			test: scripts.test,
			dev: scripts.dev,
		},
		initialRoute: epicshopConfig.initialRoute,
	}

	try {
		return AppConfigSchema.parse(appConfig)
	} catch (error) {
		if (error instanceof z.ZodError) {
			const flattenedErrors = error.flatten()
			const errorMessages = Object.entries(flattenedErrors.fieldErrors)
				.map(([field, errors]) => `${field}: ${errors?.join(', ')}`)
				.concat(flattenedErrors.formErrors)
			throw new Error(
				`Invalid app configuration for ${fullPath}:\n${errorMessages.join('\n')}`,
			)
		}
		throw error
	}
}
