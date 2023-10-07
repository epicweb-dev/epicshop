import os from 'os'
import path from 'path'
import { redirect } from '@remix-run/node'
import fsExtra from 'fs-extra'
import md5 from 'md5-hex'
import { z } from 'zod'

const TokenSetSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	scope: z.string(),
})
const DataSchema = z.object({
	authInfo: z
		.object({
			tokenSet: TokenSetSchema,
			email: z.string(),
			name: z.string().optional(),
		})
		.optional(),
})

const appDir = path.join(os.homedir(), '.kcdshop')
const dbPath = path.join(appDir, 'data.json')

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
	const data = DataSchema.parse({ authInfo: { tokenSet, email, name } })
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, data)
	return data.authInfo
}

export async function deleteAuthInfo() {
	const db = await readDb()
	if (!db) return
	delete db.authInfo
	await fsExtra.ensureDir(appDir)
	await fsExtra.writeJSON(dbPath, db)
}
