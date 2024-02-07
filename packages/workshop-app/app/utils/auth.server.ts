import { EventEmitter } from 'events'
import { remember } from '@epic-web/remember'
import { Issuer, type Client } from 'openid-client'
import { EVENTS } from './auth-events.ts'
import { setAuthInfo } from './db.server.ts'
import { getErrorMessage } from './misc.tsx'

const { ISSUER = 'https://www.epicweb.dev/oauth' } = process.env
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export const authEmitter = remember('authEmitter', () => new EventEmitter())
// cleanup any that may exist already
authEmitter.removeAllListeners()

export async function registerDevice() {
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
				error: 'Timed out waiting for user to authorize device.',
			})
			return
		}

		const userinfo = await client.userinfo(tokenSet)
		await setAuthInfo({ tokenSet, email: userinfo.email, name: userinfo.name })
		authEmitter.emit(EVENTS.AUTH_RESOLVED)
	} catch (error) {
		authEmitter.emit(EVENTS.AUTH_REJECTED, {
			error: getErrorMessage(error),
		})
	}
}
