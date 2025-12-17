import { getApps } from '@epic-web/workshop-utils/apps.server'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader() {
	ensureUndeployed()
	const apps = await getApps()
	return Response.json({ apps })
}
