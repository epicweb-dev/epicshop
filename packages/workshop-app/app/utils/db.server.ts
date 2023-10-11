import os from 'os'
import path from 'path'
import { redirect } from '@remix-run/node'
import fsExtra from 'fs-extra'
import md5 from 'md5-hex'
import { z } from 'zod'

export const DiscordMemberSchema = z.object({
	avatarURL: z.string().optional(),
	displayName: z.string(),
	id: z.string(),
})

const TokenSetSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	scope: z.string(),
})
export const PlayerPreferencesSchema = z.object({
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
const AuthInfoSchema = z.object({
	tokenSet: TokenSetSchema,
	email: z.string(),
	name: z.string().optional(),
})
const DataSchema = z.object({
	preferences: z
		.object({
			player: PlayerPreferencesSchema.optional().default({}),
		})
		.optional()
		.default({}),
	authInfo: AuthInfoSchema.optional(),
	discordMember: DiscordMemberSchema.optional(),
})

const appDir = path.join(os.homedir(), '.kcdshop')
const dbPath = path.join(appDir, 'data.json')

export async function deleteDb() {
	if (ENV.KCDSHOP_DEPLOYED) return null

	try {
		if (await fsExtra.exists(dbPath)) {
			await fsExtra.remove(dbPath)
		}
	} catch (error) {
		console.error(`Error deleting the database in ${dbPath}`, error)
	}
}

async function readDb() {
	if (ENV.KCDSHOP_DEPLOYED) return null

	try {
		if (await fsExtra.exists(dbPath)) {
			const data = await fsExtra.readJSON(dbPath)
			const db = DataSchema.parse(data)
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

export function getUserAvatar({
	email,
	size,
}: {
	email: string
	size: number
}) {
	const gravatarOptions = new URLSearchParams({
		size: size.toString(),
		default: 'identicon',
	})
	const gravatarUrl = `https://www.gravatar.com/avatar/${md5(
		email,
	)}?${gravatarOptions.toString()}`
	return gravatarUrl
}

export async function getAuthInfo() {
	const data = await readDb()
	return data?.authInfo ?? null
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
	playerPreferences: z.infer<typeof PlayerPreferencesSchema>,
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
