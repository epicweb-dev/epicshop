import './init-env.js'

import { randomUUID as cuid } from 'crypto'
import fsExtra from 'fs-extra'
import { redirect } from 'react-router'
import { z } from 'zod'
import { getWorkshopConfig } from './config.server.js'
import { saveJSON, loadJSON, migrateLegacyData } from './data-storage.server.js'
import {
	requestStorageify,
	resetRequestContext,
} from './request-context.server.js'

// Attempt migration from legacy ~/.epicshop
await migrateLegacyData().catch(() => {})

const TokenSetSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	scope: z.string(),
})
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
			.default({}),
		muted: z.boolean().default(false),
		theater: z.boolean().default(false),
		defaultView: z.string().optional(),
		activeSidebarTab: z.number().optional(),
	})
	.default({})

const PresencePreferencesSchema = z
	.object({
		optOut: z.boolean().default(false),
	})
	.default({})

const AuthInfoSchema = z.object({
	id: z.string(),
	tokenSet: TokenSetSchema,
	email: z.string(),
	name: z.string().nullable().optional(),
})

const MutedNotificationSchema = z.array(z.string()).default([])

export type TipId =
	| 'visited-home'
	| 'opened-exercise'
	| 'viewed-problem'
	| 'viewed-solution'
	| 'signed-in'
	| 'set-playground'
	| 'opened-files'
	| 'started-app'
	| 'ran-tests'
	| 'viewed-diff'
	| 'configured-editor'
	| 'configured-preferences'
	| 'used-keyboard-shortcuts'
	| 'marked-exercise-lesson-as-complete'
	| 'installed-mcp'

export const TipSchema = z.object({
	id: z.string(),
	discoveredAt: z.number().nullable().default(null),
	dismissedAt: z.number().nullable().default(null),
	showAgainAt: z.number().nullable().default(null),
})

export type Tip = z.infer<typeof TipSchema>

export const OnboardingDataSchema = z
	.object({
		tourVideosWatched: z.array(z.string()).default([]),
		tips: z.array(TipSchema).default([]),
	})
	.default({})

export type OnboardingData = z.infer<typeof OnboardingDataSchema>

const DataSchema = z.object({
	onboarding: OnboardingDataSchema,
	preferences: z
		.object({
			player: PlayerPreferencesSchema,
			presence: PresencePreferencesSchema,
			playground: z
				.object({
					persist: z.boolean().default(false),
				})
				.default({}),
			fontSize: z.number().optional(),
			exerciseWarning: z
				.object({
					dismissed: z.boolean().default(false),
				})
				.default({}),
		})
		.default({}),
	// deprecated. Probably safe to remove in May 2026:
	authInfo: AuthInfoSchema.optional(),
	authInfos: z.record(z.string(), AuthInfoSchema).optional(),
	clientId: z.string().optional(),
	mutedNotifications: MutedNotificationSchema,
})

export async function getClientId() {
	const data = await readDb()
	if (data?.clientId) return data.clientId

	const clientId = cuid()
	await updateDb({ ...data, clientId })
	return clientId
}

export async function logout() {
	const config = getWorkshopConfig()
	const host = config.product.host
	if (host) {
		const data = await readDb()
		const newAuthInfos = { ...data?.authInfos }
		delete newAuthInfos[host]
		await updateDb({
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

async function _readDb() {
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

const requestStorageKey = 'readDb'
export const readDb = requestStorageify(_readDb, requestStorageKey)

async function updateDb(data: z.input<typeof DataSchema>) {
	await saveJSON(data)
	resetRequestContext(requestStorageKey)
}

export async function getAuthInfo() {
	const config = getWorkshopConfig()
	const data = await readDb()
	if (config.product.host && typeof data?.authInfos === 'object') {
		if (config.product.host in data.authInfos) {
			return data.authInfos[config.product.host]
		}
	}

	// special case for non-epicweb/epicreact workshops
	if (
		!config.product.host ||
		config.product.host === 'epicweb.dev' ||
		config.product.host === 'epicreact.dev'
	) {
		// upgrade from old authInfo to new authInfos
		if (data?.authInfo && config.product.host) {
			await setAuthInfo(data.authInfo)
		}
		return data?.authInfo ?? null
	}

	return null
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
}: {
	id: string
	tokenSet: Partial<z.infer<typeof TokenSetSchema>>
	email?: string | null
	name?: string | null
}) {
	const data = await readDb()
	const authInfo = AuthInfoSchema.parse({ id, tokenSet, email, name })
	const config = getWorkshopConfig()
	if (config.product.host) {
		await updateDb({
			...data,
			authInfos: {
				...data?.authInfos,
				[config.product.host]: authInfo,
			},
		})
	} else {
		await updateDb({ ...data, authInfo })
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
	await updateDb(updatedData)
	return updatedData.preferences
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
	await updateDb(updatedData)
	return mutedNotifications
}

export async function setFontSizePreference(fontSize: number | undefined) {
	const data = await readDb()
	const updatedData = {
		...data,
		preferences: { ...data?.preferences, fontSize },
	}
	await updateDb(updatedData)
	return updatedData.preferences.fontSize
}

export async function getFontSizePreference() {
	const data = await readDb()
	return data?.preferences?.fontSize ?? null
}

export async function readOnboardingData() {
	const data = await readDb()
	const onboarding = data?.onboarding
	if (!onboarding) return null
	return OnboardingDataSchema.parse(onboarding)
}

export async function markOnboardingVideoWatched(videoUrl: string) {
	const data = await readDb()
	const currentOnboarding = data?.onboarding ?? {
		tourVideosWatched: [],
		tips: [],
	}
	const updatedOnboarding = OnboardingDataSchema.parse({
		...currentOnboarding,
		tourVideosWatched: [
			...(currentOnboarding.tourVideosWatched ?? []),
			videoUrl,
		].filter(Boolean),
	})
	const updatedData = {
		...data,
		onboarding: updatedOnboarding,
	}
	await updateDb(updatedData)
	return updatedOnboarding
}

export async function unmarkOnboardingVideoWatched(videoUrl: string) {
	const data = await readDb()
	const currentOnboarding = data?.onboarding ?? {
		tourVideosWatched: [],
		tips: [],
	}
	const watchedVideos = currentOnboarding.tourVideosWatched ?? []
	const updatedOnboarding = OnboardingDataSchema.parse({
		...currentOnboarding,
		tourVideosWatched: watchedVideos.filter((url) => url !== videoUrl),
	})
	const updatedData = {
		...data,
		onboarding: updatedOnboarding,
	}
	await updateDb(updatedData)
	return updatedOnboarding
}

export async function areAllOnboardingVideosWatched(
	onboardingVideos: string[],
) {
	const data = await readDb()
	const onboarding = data?.onboarding
	const watchedVideos = onboarding?.tourVideosWatched ?? []
	return onboardingVideos.every((video) => watchedVideos.includes(video))
}

export async function getOnboardingTips() {
	const data = await readDb()
	if (!data) return []
	return data.onboarding.tips
}

export async function recordDiscoveredTip(tipId: TipId) {
	const data = await readDb()
	if (!data) return null

	const currentOnboarding = data.onboarding
	const existingTips = currentOnboarding.tips
	const existingTip = existingTips.find((tip) => tip.id === tipId)
	const now = Date.now()

	if (existingTip) {
		if (existingTip.discoveredAt) {
			return existingTip
		}
		const updatedTips = existingTips.map((tip) =>
			tip.id === tipId ? { ...tip, discoveredAt: now } : tip,
		)
		const updatedOnboarding = OnboardingDataSchema.parse({
			...currentOnboarding,
			tips: updatedTips,
		})
		const updatedData = {
			...data,
			onboarding: updatedOnboarding,
		}
		await updateDb(updatedData)
		return updatedTips.find((tip) => tip.id === tipId)!
	}

	const newTip = TipSchema.parse({
		id: tipId,
		discoveredAt: now,
		dismissedAt: null,
		showAgainAt: null,
	})
	const updatedTips = [...existingTips, newTip]
	const updatedOnboarding = OnboardingDataSchema.parse({
		...currentOnboarding,
		tips: updatedTips,
	})
	const updatedData = {
		...data,
		onboarding: updatedOnboarding,
	}
	await updateDb(updatedData)
	return newTip
}

export async function dismissTip(
	tipId: TipId,
	options?: { showAgainMs?: number },
) {
	const data = await readDb()
	if (!data) return null

	const currentOnboarding = data.onboarding
	const existingTips = currentOnboarding.tips
	const existingTip = existingTips.find((tip) => tip.id === tipId)
	const now = Date.now()

	if (!existingTip) {
		const newTip = TipSchema.parse({
			id: tipId,
			discoveredAt: null,
			dismissedAt: now,
			showAgainAt: options?.showAgainMs ? now + options.showAgainMs : null,
		})
		const updatedTips = [...existingTips, newTip]
		const updatedOnboarding = OnboardingDataSchema.parse({
			...currentOnboarding,
			tips: updatedTips,
		})
		const updatedData = {
			...data,
			onboarding: updatedOnboarding,
		}
		await updateDb(updatedData)
		return newTip
	}

	const updatedTips = existingTips.map((tip) =>
		tip.id === tipId
			? {
					...tip,
					dismissedAt: now,
					showAgainAt: options?.showAgainMs ? now + options.showAgainMs : null,
				}
			: tip,
	)
	const updatedOnboarding = OnboardingDataSchema.parse({
		...currentOnboarding,
		tips: updatedTips,
	})
	const updatedData = {
		...data,
		onboarding: updatedOnboarding,
	}
	await updateDb(updatedData)
	return updatedTips.find((tip) => tip.id === tipId)!
}

export async function hasTip(tipId: TipId) {
	const tips = await getOnboardingTips()
	const tip = tips.find((t) => t.id === tipId)
	return tip?.discoveredAt !== null && tip?.discoveredAt !== undefined
}

export async function isTipDismissed(tipId: TipId) {
	const tips = await getOnboardingTips()
	const tip = tips.find((t) => t.id === tipId)
	if (!tip) return false
	if (!tip.dismissedAt) return false
	if (tip.showAgainAt && Date.now() >= tip.showAgainAt) {
		return false
	}
	return true
}
