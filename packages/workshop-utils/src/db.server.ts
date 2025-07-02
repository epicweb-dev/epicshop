import os from 'os'
import path from 'path'
import { createId as cuid } from '@paralleldrive/cuid2'
import fsExtra from 'fs-extra'
import { redirect } from 'react-router'
import { z } from 'zod'
import { getWorkshopConfig } from './config.server.js'

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
			.optional()
			.default({}),
		muted: z.boolean().optional(),
		theater: z.boolean().optional(),
		defaultView: z.string().optional(),
		activeSidebarTab: z.number().optional(),
	})
	.optional()
	.default({})

const PresencePreferencesSchema = z
	.object({
		optOut: z.boolean(),
	})
	.optional()
	.default({ optOut: false })

const AuthInfoSchema = z.object({
	id: z.string(),
	tokenSet: TokenSetSchema,
	email: z.string(),
	name: z.string().nullable().optional(),
})

const MutedNotificationSchema = z.array(z.string()).default([])

const DataSchema = z.object({
	onboarding: z
		.object({
			tourVideosWatched: z.array(z.string()).default([]),
		})
		.passthrough()
		.optional()
		.default({ tourVideosWatched: [] }),
	preferences: z
		.object({
			player: PlayerPreferencesSchema,
			presence: PresencePreferencesSchema,
			playground: z
				.object({
					persist: z.boolean().default(false),
				})
				.optional(),
			fontSize: z.number().optional(),
		})
		.optional()
		.default({}),
	// deprecated. Probably safe to remove in May 2026:
	authInfo: AuthInfoSchema.optional(),
	// new:
	authInfos: z.record(z.string(), AuthInfoSchema).optional(),
	clientId: z.string().optional(),
	mutedNotifications: MutedNotificationSchema.optional(),
})

const appDir = path.join(os.homedir(), '.epicshop')
const dbPath = path.join(appDir, 'data.json')

export async function getClientId() {
	const data = await readDb()
	if (data?.clientId) return data.clientId

	const clientId = cuid()
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, { ...data, clientId })
	return clientId
}

export async function logout() {
	const config = getWorkshopConfig()
	const host = config.product.host
	if (host) {
		const data = await readDb()
		const newAuthInfos = { ...data?.authInfos }
		delete newAuthInfos[host]
		await fsExtra.writeJSON(dbPath, {
			...data,
			authInfos: newAuthInfos,
		})
	}
}

export async function deleteDb() {
	if (process.env.EPICSHOP_DEPLOYED) return null

	try {
		if (await fsExtra.exists(dbPath)) {
			await fsExtra.remove(dbPath)
		}
	} catch (error) {
		console.error(`Error deleting the database in ${dbPath}`, error)
	}
}

async function readDb() {
	if (process.env.EPICSHOP_DEPLOYED) return null

	try {
		if (await fsExtra.exists(dbPath)) {
			const db = DataSchema.parse(await fsExtra.readJSON(dbPath))
			return db
		}
	} catch (error) {
		console.error(
			`Error reading the database in ${dbPath}, moving it to a .bkp file to avoid parsing errors in the future`,
			error,
		)
		void fsExtra.move(dbPath, `${dbPath}.bkp`).catch(() => {})
	}
	return null
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
	await fsExtra.ensureDir(appDir)
	const config = getWorkshopConfig()
	if (config.product.host) {
		await fsExtra.writeJSON(dbPath, {
			...data,
			authInfos: {
				...data?.authInfos,
				[config.product.host]: authInfo,
			},
		})
	} else {
		await fsExtra.writeJSON(dbPath, { ...data, authInfo })
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
		},
	}
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
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
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
	return mutedNotifications
}

export async function setFontSizePreference(fontSize: number | undefined) {
	const data = await readDb()
	const updatedData = {
		...data,
		preferences: { ...data?.preferences, fontSize },
	}
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
	return updatedData.preferences.fontSize
}

export async function getFontSizePreference() {
	const data = await readDb()
	return data?.preferences?.fontSize ?? null
}

export async function readOnboardingData() {
	const data = await readDb()
	return data?.onboarding ?? null
}

export async function markOnboardingVideoWatched(videoUrl: string) {
	const data = await readDb()
	const updatedData = {
		...data,
		onboarding: {
			...data?.onboarding,
			tourVideosWatched: [
				...(data?.onboarding.tourVideosWatched ?? []),
				videoUrl,
			].filter(Boolean),
		},
	}
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
	return updatedData.onboarding
}
