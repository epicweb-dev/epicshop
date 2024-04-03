import { getApps } from '@kentcdodds/workshop-utils/apps.server'
import { json } from '@remix-run/node'

export async function loader() {
	const apps = await getApps()
	return json({ apps })
}
