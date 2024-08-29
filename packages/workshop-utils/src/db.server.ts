import os from 'os'
import path from 'path'
import { redirect } from '@remix-run/node'
import fsExtra from 'fs-extra'
import md5 from 'md5-hex'
import { z } from 'zod'

export const DiscordMemberSchema = z.object({
	avatarURL: z.string().nullable().optional(),
	displayName: z.string(),
	id: z.string(),
})

const TokenSetSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	scope: z.string(),
})
export const PlayerPreferencesSchema = z
	.object({
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

const AuthInfoSchema = z
	.object({
		tokenSet: TokenSetSchema,
		email: z.string(),
		name: z.string().nullable().optional(),
	})
	.transform((d) => ({ ...d, id: md5(d.email) }))

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
		})
		.optional()
		.default({}),
	authInfo: AuthInfoSchema.optional(),
	discordMember: DiscordMemberSchema.optional(),
})

const appDir = path.join(os.homedir(), '.epicshop')
const dbPath = path.join(appDir, 'data.json')

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
	const data = await readDb()
	return data?.authInfo ?? null
}

export async function getUserInfo() {
	const db = await readDb()
	if (!db?.authInfo) return null

	return {
		id: db.authInfo.id,
		name: db.discordMember?.displayName ?? db.authInfo.name ?? null,
		email: db.authInfo.email,
		avatarUrl:
			db.discordMember?.avatarURL ??
			getGravatar({ email: db.authInfo.email, size: 288 }),
	}
}

function getGravatar({ email, size }: { email: string; size: number }) {
	const gravatarOptions = new URLSearchParams({
		size: size.toString(),
		default: 'identicon',
	})
	const gravatarUrl = `https://www.gravatar.com/avatar/${md5(
		email,
	)}?${gravatarOptions.toString()}`
	return gravatarUrl
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
				: redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')
		throw redirect(loginRedirect)
	}
	return authInfo
}

export async function setAuthInfo({
	tokenSet,
	email = 'unknown@example.com',
	name,
}: {
	tokenSet: Partial<z.infer<typeof TokenSetSchema>>
	email?: string
	name?: string
}) {
	const data = await readDb()
	const authInfo = AuthInfoSchema.parse({ tokenSet, email, name })
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, { ...data, authInfo })
	return authInfo
}

export async function getPreferences() {
	const data = await readDb()
	return data?.preferences ?? null
}

export async function setPlayerPreferences(
	playerPreferences: z.input<typeof PlayerPreferencesSchema>,
) {
	const data = await readDb()
	const updatedData = {
		...data,
		preferences: { ...data?.preferences, player: playerPreferences },
	}
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
	return updatedData.preferences.player
}

export async function setPresencePreferences(
	presnecePreferences: z.input<typeof PresencePreferencesSchema>,
) {
	const data = await readDb()
	const updatedData = {
		...data,
		preferences: { ...data?.preferences, presence: presnecePreferences },
	}
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
	return updatedData.preferences.presence
}

export async function getDiscordMember() {
	const data = await readDb()
	return data?.discordMember ?? null
}

export async function setDiscordMember(
	discordMember: z.infer<typeof DiscordMemberSchema>,
) {
	const data = await readDb()
	const updatedData = {
		...data,
		discordMember,
	}
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, updatedData)
	return updatedData.discordMember
}

export async function deleteDiscordInfo() {
	const data = await readDb()
	delete data?.discordMember
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, data)
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
