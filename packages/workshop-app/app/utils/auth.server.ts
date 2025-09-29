import { EventEmitter } from 'events'
import { remember } from '@epic-web/remember'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { setAuthInfo } from '@epic-web/workshop-utils/db.server'
import { getUserInfo } from '@epic-web/workshop-utils/epic-api.server'
import { logger } from '@epic-web/workshop-utils/logger'
import * as client from 'openid-client'
import { z } from 'zod'
import { EVENTS } from './auth-events.ts'
import { getErrorMessage } from './misc.tsx'

const log = logger('epic:auth')

const UserInfoSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable().optional(),
})

export const authEmitter = remember('authEmitter', () => new EventEmitter())
// cleanup any that may exist already
authEmitter.removeAllListeners()

export async function registerDevice() {
	log('Starting device registration process')
	const {
		product: { host },
	} = getWorkshopConfig()
	const { ISSUER = `https://${host}/oauth` } = process.env
	log.info(`Using OAuth issuer: ${ISSUER}`)

	try {
		log('Discovering OAuth configuration')
		const config = await client.discovery(new URL(ISSUER), 'EPICSHOP_APP')
		log.info('OAuth configuration discovered successfully')

		log('Initiating device authorization')
		const deviceResponse = await client.initiateDeviceAuthorization(config, {})
		log.info(
			`Device authorization initiated - user code: ${deviceResponse.user_code}`,
		)

		authEmitter.emit(EVENTS.USER_CODE_RECEIVED, {
			code: deviceResponse.user_code,
			url: deviceResponse.verification_uri_complete,
		})

		const timeout = setTimeout(() => {
			log.error('Device authorization timed out')
			throw new Error('Device authorization timed out')
		}, deviceResponse.expires_in * 1000)

		try {
			log('Polling for device authorization grant')
			const tokenSet = await client.pollDeviceAuthorizationGrant(
				config,
				deviceResponse,
			)
			clearTimeout(timeout)

			if (!tokenSet) {
				log.error('No token set received from device authorization')
				authEmitter.emit(EVENTS.AUTH_REJECTED, {
					error: 'No token set',
				})
				return
			}
			log.info('Device authorization grant received successfully')

			log('Fetching user info from protected resource')
			const protectedResourceResponse = await client.fetchProtectedResource(
				config,
				tokenSet.access_token,
				new URL(`${ISSUER}/userinfo`),
				'GET',
			)
			const userinfoRaw = await protectedResourceResponse.json()
			log.info('User info fetched from protected resource')

			const userinfoResult = UserInfoSchema.safeParse(userinfoRaw)
			if (!userinfoResult.success) {
				log.error(`Failed to parse user info: ${userinfoResult.error.message}`)
				authEmitter.emit(EVENTS.AUTH_REJECTED, {
					error: `Failed to parse user info: ${userinfoResult.error.message}`,
				})
				return
			}
			const userinfo = userinfoResult.data
			log.info(
				`User info parsed successfully - ID: ${userinfo.id}, Email: ${userinfo.email}`,
			)

			log('Setting auth info in database')
			await setAuthInfo({
				id: userinfo.id,
				tokenSet,
				email: userinfo.email,
				name: userinfo.name,
			})
			log.info('Auth info saved to database successfully')

			log('Fetching fresh user info from API')
			await getUserInfo({ forceFresh: true })
			log.info('Fresh user info fetched successfully')

			log('Authentication process completed successfully')
			authEmitter.emit(EVENTS.AUTH_RESOLVED)
		} catch (error) {
			clearTimeout(timeout)
			log.error('Error during device authorization polling:', error)
			throw error
		}
	} catch (error) {
		log.error('Device registration failed:', error)
		authEmitter.emit(EVENTS.AUTH_REJECTED, {
			error: getErrorMessage(error),
		})
	}
}
