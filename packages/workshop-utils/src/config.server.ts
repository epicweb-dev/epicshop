import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { handleGitHubRepoAndRoot } from './utils.js'

export const getWorkshopRoot = () =>
	process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()

const getRootPkgJsonPath = () => path.join(getWorkshopRoot(), 'package.json')

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

export function getWorkshopConfig(): WorkshopConfig {
	if (
		configCache.config &&
		configCache.modified > fs.statSync(getRootPkgJsonPath()).mtimeMs
	) {
		return configCache.config
	}

	const packageJsonPath = path.join(getWorkshopRoot(), 'package.json')
	let packageJson: any

	try {
		const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
		packageJson = JSON.parse(packageJsonContent)
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
				`Invalid epicshop configuration in ${packageJsonPath}:\n${errorMessages.join('\n')}`,
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

	const stackBlitzConfig = {
		...appConfig.stackBlitzConfig,
		title: appConfig.stackBlitzConfig?.title ?? `${title} (${type})`,
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
