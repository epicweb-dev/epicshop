// eslint-disable-next-line import/order -- this must be first
import { getEnv } from './init-env.ts'

import { randomUUID as cuid } from 'crypto'
import * as cookie from 'cookie'
import { getAuthInfo, getClientId } from './db.server.ts'

export async function getUserId({ request }: { request: Request }) {
	if (getEnv().EPICSHOP_DEPLOYED) {
		const cookieHeader = request.headers.get('cookie')
		const cookieValue = cookie.parse(cookieHeader ?? '')

		if (cookieValue.clientId) {
			return {
				id: cookieValue.clientId,
				type: 'cookie.clientId',
			} as const
		} else {
			const newId = cuid()
			return {
				id: newId,
				type: 'cookie.randomId',
			} as const
		}
	}

	const authInfo = await getAuthInfo()

	if (authInfo?.id) {
		return {
			id: authInfo.id,
			type: 'db.authInfo',
		} as const
	}

	const clientId = await getClientId()
	return {
		id: clientId,
		type: 'db.clientId',
	} as const
}

export function getSetClientIdCookieHeader(clientId: string) {
	return `clientId=${clientId}; Path=/; HttpOnly; SameSite=Lax`
}
