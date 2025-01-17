import { EventEmitter } from 'events'
import { remember } from '@epic-web/remember'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { setAuthInfo } from '@epic-web/workshop-utils/db.server'
import { getUserInfo } from '@epic-web/workshop-utils/epic-api.server'
import * as client from 'openid-client'
import { z } from 'zod'
import { EVENTS } from './auth-events.ts'
import { getErrorMessage } from './misc.tsx'

const UserInfoSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable().optional(),
})

export const authEmitter = remember('authEmitter', () => new EventEmitter())
// cleanup any that may exist already
authEmitter.removeAllListeners()

export async function registerDevice() {
	const {
		product: { host },
	} = getWorkshopConfig()
	const { ISSUER = `https://${host}/oauth` } = process.env
	try {
		const config = await client.discovery(new URL(ISSUER), 'EPICSHOP_APP')
		const deviceResponse = await client.initiateDeviceAuthorization(config, {})

		authEmitter.emit(EVENTS.USER_CODE_RECEIVED, {
			code: deviceResponse.user_code,
			url: deviceResponse.verification_uri_complete,
		})

		const timeout = setTimeout(() => {
			throw new Error('Device authorization timed out')
		}, deviceResponse.expires_in * 1000)

		try {
			const tokenSet = await client.pollDeviceAuthorizationGrant(
				config,
				deviceResponse,
			)
			clearTimeout(timeout)

			if (!tokenSet) {
				authEmitter.emit(EVENTS.AUTH_REJECTED, {
					error: 'No token set',
				})
				return
			}

			const protectedResourceResponse = await client.fetchProtectedResource(
				config,
				tokenSet.access_token,
				new URL(`${ISSUER}/userinfo`),
				'GET',
			)
			const userinfoRaw = await protectedResourceResponse.json()
			const userinfoResult = UserInfoSchema.safeParse(userinfoRaw)
			if (!userinfoResult.success) {
				authEmitter.emit(EVENTS.AUTH_REJECTED, {
					error: `Failed to parse user info: ${userinfoResult.error.message}`,
				})
				return
			}
			const userinfo = userinfoResult.data

			await setAuthInfo({
				id: userinfo.id,
				tokenSet,
				email: userinfo.email,
				name: userinfo.name,
			})

			await getUserInfo({ forceFresh: true })

			authEmitter.emit(EVENTS.AUTH_RESOLVED)
		} catch (error) {
			clearTimeout(timeout)
			throw error
		}
	} catch (error) {
		authEmitter.emit(EVENTS.AUTH_REJECTED, {
			error: getErrorMessage(error),
		})
	}
}
