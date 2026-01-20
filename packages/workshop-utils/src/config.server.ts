// eslint-disable-next-line import/order -- this must be first
import { getEnv } from './init-env.ts'

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { handleGitHubRepoAndRoot } from './utils.ts'

const getRootPkgJsonPath = () =>
	path.join(getEnv().EPICSHOP_CONTEXT_CWD, 'package.json')

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

const BaseProductSchema = z.object({
	host: z.string().optional(),
	displayName: z.string().optional(),
	displayNameShort: z.string().optional(),
	slug: z.string().optional(),
})

const BaseWorkshopConfigFields = {
	title: z.string().optional(),
	subtitle: z.string().optional(),
	instructor: InstructorSchema.optional(),
	product: BaseProductSchema.optional(),
}

const formatFieldErrors = (errors: unknown) =>
	Array.isArray(errors) ? errors.join(', ') : ''

function transformProductFields<
	T extends {
		product?: {
			host?: string
			displayName?: string
			displayNameShort?: string
			slug?: string
		}
	},
>(
	data: T,
): T & {
	product: {
		host: string | undefined
		displayName: string | undefined
		displayNameShort: string | undefined
		slug: string | undefined
	}
} {
	const product = data.product ?? {}
	return {
		...data,
		product: {
			host: product.host,
			displayName: product.displayName,
			displayNameShort: product.displayNameShort ?? product.displayName,
			slug: product.slug,
		},
	}
}

const defaultProductConfig = {
	host: 'www.epicweb.dev',
	displayName: 'EpicWeb.dev',
	displayNameShort: 'Epic Web',
	logo: '/logo.svg',
}

const defaultFormsConfig = {
	workshop:
		'https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}',
	exercise:
		'https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}',
}

const defaultTestTabConfig = {
	enabled: true,
}

const PartialWorkshopConfigSchema = z
	.object(BaseWorkshopConfigFields)
	.transform(transformProductFields)

export type PartialWorkshopConfig = z.infer<typeof PartialWorkshopConfigSchema>

// most defaults are for backwards compatibility
const WorkshopConfigSchema = z
	.object({
		...BaseWorkshopConfigFields,
		title: z.string(),
		subdomain: z.string().optional(),
		product: z
			.object({
				host: z.string().default('www.epicweb.dev'),
				displayName: z.string().default('EpicWeb.dev'),
				displayNameShort: z.string().default('Epic Web'),
				logo: z.string().default('/logo.svg'),
				slug: z.string().optional(),
				discordChannelId: z.string().optional(),
				discordTags: z.array(z.string()).optional(),
			})
			.default(defaultProductConfig),
		githubRepo: z
			.string()
			.transform((githubRepo) => githubRepo ?? getEnv().EPICSHOP_GITHUB_REPO),
		githubRoot: z
			.string()
			.transform((githubRoot) => githubRoot ?? getEnv().EPICSHOP_GITHUB_ROOT),
		stackBlitzConfig: StackBlitzConfigSchema.optional(),
		forms: z
			.object({
				workshop: z.string().default(defaultFormsConfig.workshop),
				exercise: z.string().default(defaultFormsConfig.exercise),
			})
			.default(defaultFormsConfig),
		testTab: z
			.object({
				enabled: z.boolean().default(true),
			})
			.default(defaultTestTabConfig),
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
		sidecarProcesses: z.record(z.string(), z.string()).optional().default({}),
		// Default app type for simple apps (no package.json).
		// - 'standard': Normal simple app behavior
		// - 'export': Export app that displays console output and exported values
		appType: z.enum(['standard', 'export']).optional(),
	})
	.transform((data) => {
		return {
			...data,
			product: {
				...data.product,
				displayNameShort:
					data.product.displayNameShort ?? data.product.displayName,
			},
		}
	})

export type WorkshopConfig = z.infer<typeof WorkshopConfigSchema>

/**
 * Parse epicshop config from an arbitrary package.json object.
 * Unlike getWorkshopConfig(), this doesn't require EPICSHOP_CONTEXT_CWD
 * and returns partial/optional config suitable for external repos.
 */
export function parseEpicshopConfig(
	packageJson: unknown,
): PartialWorkshopConfig | null {
	if (
		typeof packageJson !== 'object' ||
		packageJson === null ||
		!('epicshop' in packageJson)
	) {
		return null
	}

	const epicshopConfig = (packageJson as { epicshop: unknown }).epicshop
	const result = PartialWorkshopConfigSchema.safeParse(epicshopConfig)
	if (!result.success) {
		return null
	}

	return result.data
}

let configCache: WorkshopConfig | null = null

// Utility to read and parse the root package.json
function readRootPkgJson(): any {
	const contextCwd = getEnv().EPICSHOP_CONTEXT_CWD
	if (!contextCwd) {
		const error = new Error('Not in a workshop directory')
		error.name = 'NotInWorkshopDirectoryError'
		throw error
	}
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
 * This used to support subdomains on localhost, but that caused too many issues.
 */
export function getWorkshopUrl(port: number) {
	return `http://localhost:${port}`
}

export function getWorkshopConfig(): WorkshopConfig {
	// If config is cached, use it
	if (configCache) return configCache

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
		configCache = parsedConfig

		return parsedConfig
	} catch (error) {
		if (error instanceof z.ZodError) {
			const flattenedErrors = error.flatten()
			const errorMessages = Object.entries(flattenedErrors.fieldErrors)
				.map(([field, errors]) => `${field}: ${formatFieldErrors(errors)}`)
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

	const relativePath = fullPath.replace(
		`${getEnv().EPICSHOP_CONTEXT_CWD}${path.sep}`,
		'',
	)

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
			.default({ enabled: workshopConfig.testTab?.enabled ?? true }),
		scripts: z
			.object({
				test: z.string().optional(),
				dev: z.string().optional(),
			})
			.default({}),
		initialRoute: z.string().optional().default(workshopConfig.initialRoute),
		/**
		 * The type of app for simple apps (no dev script).
		 * - 'standard': Normal simple app behavior (browser type)
		 * - 'export': Export app that displays console output and exported values
		 */
		appType: z
			.enum(['standard', 'export'])
			.optional()
			.default(workshopConfig.appType ?? 'standard'),
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
		appType: epicshopConfig.appType,
	}

	try {
		const parsedConfig = AppConfigSchema.parse(appConfig)

		return {
			...parsedConfig,
			isExportApp: parsedConfig.appType === 'export',
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			const flattenedErrors = error.flatten()
			const errorMessages = Object.entries(flattenedErrors.fieldErrors)
				.map(([field, errors]) => `${field}: ${formatFieldErrors(errors)}`)
				.concat(flattenedErrors.formErrors)
			throw new Error(
				`Invalid app configuration for ${fullPath}:\n${errorMessages.join('\n')}`,
			)
		}
		throw error
	}
}
