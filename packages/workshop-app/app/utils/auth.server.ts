import { EventEmitter } from 'events'
import { Issuer, type Client } from 'openid-client'
import { singleton } from '#app/utils/singleton.server.ts'
import { EVENTS } from './auth-events.ts'
import { setAuthInfo } from './db.server.ts'

const { ISSUER = 'https://www.epicweb.dev/oauth' } = process.env
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export const authEmitter = singleton('authEmitter', () => new EventEmitter())
// cleanup any that may exist already
authEmitter.removeAllListeners()

export async function registerDevice() {
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
	if (!tokenSet) return

	await setAuthInfo({ tokenSet })
	authEmitter.emit(EVENTS.AUTH_RESOLVED)
}
