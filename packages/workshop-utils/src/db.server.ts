import './init-env.ts'

import { randomUUID as cuid } from 'crypto'
import fsExtra from 'fs-extra'
import { redirect } from 'react-router'
import { z } from 'zod'
import { getWorkshopConfig } from './config.server.ts'
import { saveJSON, loadJSON, migrateLegacyData } from './data-storage.server.ts'

// Attempt migration from legacy ~/.epicshop
await migrateLegacyData().catch(() => {})

const TokenSetSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	scope: z.string(),
})
const defaultSubtitlePreferences = {
	id: null,
	mode: 'disabled',
} as const
const defaultPlayerPreferences = {
	subtitle: defaultSubtitlePreferences,
}
const defaultOfflineVideoPreferences = {}
const defaultPresencePreferences = {
	optOut: false,
}
const defaultExerciseWarningPreferences = {
	dismissed: false,
}
const defaultPreferences = {
	player: defaultPlayerPreferences,
	offlineVideo: defaultOfflineVideoPreferences,
	presence: defaultPresencePreferences,
	exerciseWarning: defaultExerciseWarningPreferences,
	onboardingComplete: [],
}
export const PlayerPreferencesSchema = z
	.object({
		minResolution: z.number().optional(),
		maxResolution: z.number().optional(),
		volumeRate: z.number().optional(),
		playbackRate: z.number().optional(),
		autoplay: z.boolean().optional(),
		subtitle: z
			.object({
				id: z.string().nullable().default(null),
				mode: z
					.literal('disabled')
					.or(z.literal('hidden'))
					.or(z.literal('showing'))
					.nullable()
					.default('disabled'),
			})
			.default(defaultSubtitlePreferences),
		muted: z.boolean().optional(),
		theater: z.boolean().optional(),
		defaultView: z.string().optional(),
		activeSidebarTab: z.number().optional(),
	})
	.optional()
	.default(defaultPlayerPreferences)

const OfflineVideoResolutionSchema = z.enum(['best', 'high', 'medium', 'low'])
const OfflineVideoPreferencesSchema = z
	.object({
		downloadResolution: OfflineVideoResolutionSchema.optional(),
	})
	.optional()
	.default(defaultOfflineVideoPreferences)

const PresencePreferencesSchema = z
	.object({
		optOut: z.boolean(),
	})
	.optional()
	.default(defaultPresencePreferences)

const AuthInfoSchema = z.object({
	id: z.string(),
	tokenSet: TokenSetSchema,
	email: z.string(),
	name: z.string().nullable().optional(),
})

const MutedNotificationSchema = z.array(z.string()).default([])

const DataSchema = z.object({
	preferences: z
		.object({
			player: PlayerPreferencesSchema,
			offlineVideo: OfflineVideoPreferencesSchema,
			presence: PresencePreferencesSchema,
			playground: z
				.object({
					persist: z.boolean().default(false),
				})
				.optional(),
			fontSize: z.number().optional(),
			exerciseWarning: z
				.object({
					dismissed: z.boolean().default(false),
				})
				.optional()
				.default(defaultExerciseWarningPreferences),
			// Array of completed onboarding feature IDs (e.g., ['files-popover', 'persist-playground'])
			onboardingComplete: z.array(z.string()).optional().default([]),
		})
		.optional()
		.default(defaultPreferences),
	// deprecated. Probably safe to remove in May 2026:
	authInfo: AuthInfoSchema.optional(),
	// new:
	authInfos: z.record(z.string(), AuthInfoSchema).optional(),
	clientId: z.string().optional(),
	mutedNotifications: MutedNotificationSchema.optional(),
})

export async function getClientId() {
	const data = await readDb()
	if (data?.clientId) return data.clientId

	const clientId = cuid()
	await saveJSON({ ...data, clientId })
	return clientId
}

function tryGetWorkshopProductHost(): string | undefined {
	try {
		return getWorkshopConfig().product.host
	} catch {
		return undefined
	}
}

export async function logout({ productHost }: { productHost?: string } = {}) {
	const host = productHost ?? tryGetWorkshopProductHost()
	if (host) {
		const data = await readDb()
		const newAuthInfos = { ...data?.authInfos }
		delete newAuthInfos[host]
		await saveJSON({
			...data,
			authInfos: newAuthInfos,
		})
	}
}

export async function deleteDb() {
	if (process.env.EPICSHOP_DEPLOYED) return null

	try {
		const { path: dbPath } = await loadJSON()
		if (dbPath && (await fsExtra.exists(dbPath))) {
			await fsExtra.remove(dbPath)
		}
	} catch (error) {
		console.error(`Error deleting the database`, error)
	}
}

export async function readDb() {
	if (process.env.EPICSHOP_DEPLOYED) return null

	const maxRetries = 3
	const baseDelay = 10

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const { data, path: dbPath } = await loadJSON()
			if (data && dbPath) {
				const db = DataSchema.parse(data)
				return db
			}
			return null
		} catch (error) {
			// If this is a retry attempt, it might be a race condition
			if (attempt < maxRetries) {
				const delay = baseDelay * Math.pow(2, attempt)
				console.warn(
					`Database read error on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delay}ms...`,
				)
				await new Promise((resolve) => setTimeout(resolve, delay))
				continue
			}

			// Final attempt failed, handle as corrupted file
			console.error(
				`Error reading the database after ${attempt + 1} attempts, moving it to a .bkp file to avoid parsing errors in the future`,
				error,
			)

			// Log to Sentry if available
			if (process.env.SENTRY_DSN && process.env.EPICSHOP_IS_PUBLISHED) {
				try {
					const Sentry = await import('@sentry/react-router')
					Sentry.captureException(error, {
						tags: {
							error_type: 'corrupted_database_file',
							retry_attempts: attempt.toString(),
						},
						extra: {
							errorMessage:
								error instanceof Error ? error.message : String(error),
							retryAttempts: attempt,
						},
					})
				} catch (sentryError) {
					console.error('Failed to log to Sentry:', sentryError)
				}
			}

			// Try to move corrupted file to backup if we can determine the path
			try {
				const { path: dbPath } = await loadJSON()
				if (dbPath && (await fsExtra.exists(dbPath))) {
					void fsExtra.move(dbPath, `${dbPath}.bkp`).catch(() => {})
				}
			} catch {}
		}
	}
	return null
}

export async function getAuthInfo({
	productHost,
}: { productHost?: string } = {}) {
	const host = productHost ?? tryGetWorkshopProductHost()
	const data = await readDb()
	if (host && typeof data?.authInfos === 'object') {
		if (host in data.authInfos) {
			return data.authInfos[host]
		}
	}

	// special case for non-epicweb/epicreact workshops
	if (!host || host === 'epicweb.dev' || host === 'epicreact.dev') {
		// upgrade from old authInfo to new authInfos
		if (data?.authInfo && host) {
			await setAuthInfo({ ...data.authInfo, productHost: host })
		}
		return data?.authInfo ?? null
	}

	return null
}

/**
 * Get all product hosts the user is logged into locally.
 * Returns an array of normalized product hosts (e.g., 'www.epicweb.dev').
 */
export async function getLoggedInProductHosts(): Promise<string[]> {
	const data = await readDb()
	const loggedInHosts: string[] = []

	// Get hosts from the new authInfos record
	if (data?.authInfos && typeof data.authInfos === 'object') {
		for (const [host, authInfo] of Object.entries(data.authInfos)) {
			if (authInfo) {
				loggedInHosts.push(host)
			}
		}
	}

	// Back-compat: if legacy authInfo exists, include the current workshop's host
	if (data?.authInfo && !loggedInHosts.length) {
		const currentHost = tryGetWorkshopProductHost()
		if (currentHost && !loggedInHosts.includes(currentHost)) {
			loggedInHosts.push(currentHost)
		}
	}

	return loggedInHosts
}

export async function requireAuthInfo({
	request,
	redirectTo,
}: {
	request: Request
	redirectTo?: string | null
}) {
	const authInfo = await getAuthInfo()
	if (!authInfo) {
		const requestUrl = new URL(request.url)
		redirectTo =
			redirectTo === null
				? null
				: (redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`)
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')
		throw redirect(loginRedirect)
	}
	return authInfo
}

export async function setAuthInfo({
	id,
	tokenSet,
	email = 'unknown@example.com',
	name,
	productHost,
}: {
	id: string
	tokenSet: Partial<z.infer<typeof TokenSetSchema>>
	email?: string | null
	name?: string | null
	productHost?: string
}) {
	const data = await readDb()
	const authInfo = AuthInfoSchema.parse({ id, tokenSet, email, name })
	const host = productHost ?? tryGetWorkshopProductHost()
	if (host) {
		await saveJSON({
			...data,
			authInfos: {
				...data?.authInfos,
				[host]: authInfo,
			},
		})
	} else {
		await saveJSON({ ...data, authInfo })
	}
	return authInfo
}

export async function getPreferences() {
	const data = await readDb()
	return data?.preferences ?? null
}

export async function setPreferences(
	preferences: z.input<typeof DataSchema>['preferences'],
) {
	const data = await readDb()
	const updatedData = {
		...data,
		preferences: {
			...data?.preferences,
			...preferences,
			player: {
				...data?.preferences?.player,
				...preferences?.player,
			},
			offlineVideo: {
				...data?.preferences?.offlineVideo,
				...preferences?.offlineVideo,
			},
			presence: {
				...data?.preferences?.presence,
				...preferences?.presence,
			},
			exerciseWarning: {
				...data?.preferences?.exerciseWarning,
				...preferences?.exerciseWarning,
			},
		},
	}
	await saveJSON(updatedData)
	return updatedData.preferences
}

/**
 * Mark an onboarding feature as complete.
 * This is used to track which tips/indicators have been dismissed.
 * @param featureId - Unique identifier for the feature (e.g., 'files-popover')
 */
export async function markOnboardingComplete(featureId: string) {
	const data = await readDb()
	const currentComplete = data?.preferences?.onboardingComplete ?? []
	// Avoid duplicates
	if (currentComplete.includes(featureId)) {
		return data?.preferences
	}
	const updatedData = {
		...data,
		preferences: {
			...data?.preferences,
			onboardingComplete: [...currentComplete, featureId],
		},
	}
	await saveJSON(updatedData)
	return updatedData.preferences
}

/**
 * Check if a user has completed an onboarding feature.
 * @param featureId - Unique identifier for the feature
 * @returns true if the user has completed this onboarding, false otherwise
 */
export async function isOnboardingComplete(featureId: string) {
	const data = await readDb()
	return data?.preferences?.onboardingComplete?.includes(featureId) ?? false
}

export async function getMutedNotifications() {
	const data = await readDb()
	return data?.mutedNotifications ?? []
}

export async function muteNotification(id: string) {
	const data = await readDb()
	const mutedNotifications = Array.from(
		new Set([...(data?.mutedNotifications ?? []), id]),
	)
	const updatedData = {
		...data,
		mutedNotifications,
	}
	await saveJSON(updatedData)
	return mutedNotifications
}

export async function setFontSizePreference(fontSize: number | undefined) {
	const data = await readDb()
	const updatedData = {
		...data,
		preferences: { ...data?.preferences, fontSize },
	}
	await saveJSON(updatedData)
	return updatedData.preferences.fontSize
}

export async function getFontSizePreference() {
	const data = await readDb()
	return data?.preferences?.fontSize ?? null
}
