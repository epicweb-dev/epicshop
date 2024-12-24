import { EventEmitter } from 'events'
import { remember } from '@epic-web/remember'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { setAuthInfo } from '@epic-web/workshop-utils/db.server'
import { getUserInfo } from '@epic-web/workshop-utils/epic-api.server'
import { createId as cuid } from '@paralleldrive/cuid2'
import md5 from 'md5-hex'
import { Issuer, type Client } from 'openid-client'
import { EVENTS } from './auth-events.ts'
import { getErrorMessage } from './misc.tsx'

export const authEmitter = remember('authEmitter', () => new EventEmitter())
// cleanup any that may exist already
authEmitter.removeAllListeners()

export async function registerDevice() {
	const {
		product: { host },
	} = getWorkshopConfig()
	const { ISSUER = `https://${host}/oauth` } = process.env
	const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
	try {
		const issuer = await Issuer.discover(ISSUER)

		// 🤷‍♂️
		const client: Client = await (issuer.Client as any).register({
			grant_types: [GRANT_TYPE],
			response_types: [],
			redirect_uris: [],
			token_endpoint_auth_method: 'none',
			application_type: 'native',
		})

		const handle = await client.deviceAuthorization()

		authEmitter.emit(EVENTS.USER_CODE_RECEIVED, {
			code: handle.user_code,
			url: handle.verification_uri_complete,
		})

		const timeout = setTimeout(() => handle.abort(), handle.expires_in * 1000)

		const tokenSet = await handle.poll().catch(() => {})
		clearTimeout(timeout)
		if (!tokenSet) {
			authEmitter.emit(EVENTS.AUTH_REJECTED, {
				error: `Timed out in ${handle.expires_in} seconds waiting for user to authorize device.`,
			})
			return
		}

		const userinfo = await client.userinfo(tokenSet)
		let id: string
		if (typeof userinfo.id === 'string') {
			id = userinfo.id
		} else {
			console.warn('[UNEXPECTED] User ID is not a string:', userinfo.id)
			id = userinfo.email ? md5(userinfo.email) : cuid()
		}
		await setAuthInfo({
			id,
			tokenSet,
			email: userinfo.email,
			name: userinfo.name,
		})

		await getUserInfo({ forceFresh: true })

		authEmitter.emit(EVENTS.AUTH_RESOLVED)
	} catch (error) {
		authEmitter.emit(EVENTS.AUTH_REJECTED, {
			error: getErrorMessage(error),
		})
	}
}
