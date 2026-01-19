import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect } from 'react-router'
import { registerDevice } from '#app/utils/auth.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import Login from './login.client.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader() {
	ensureUndeployed()
	const isAuthenticated = Boolean(await getAuthInfo())
	if (isAuthenticated) throw redirect('/account')
	return {}
}

export async function action() {
	ensureUndeployed()
	void registerDevice()
	return { status: 'pending' } as const
}

export default function LoginRoute() {
	return <Login />
}
