import { homedir } from 'os'
import { join } from 'path'
import { redirect } from '@remix-run/node'
import fsExtra from 'fs-extra'
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
		})
		.optional(),
})

const appDir = join(homedir(), '.kcdshop')
const dbPath = join(appDir, 'data.json')

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
		console.log('required auth info')
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
}: {
	tokenSet: Partial<z.infer<typeof TokenSetSchema>>
}) {
	const data = DataSchema.parse({ authInfo: { tokenSet } })
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
