import { getApps } from '@epic-web/workshop-utils/apps.server'
import { json } from '@remix-run/node'
import { ensureUndeployed } from '#app/utils/misc.js'

export async function loader() {
	ensureUndeployed()
	const apps = await getApps()
	return json({ apps })
}
