import { json } from '@remix-run/node'
import { getApps } from '~/utils/apps.server'

export async function loader() {
	const apps = await getApps()
	return json({ apps })
}
