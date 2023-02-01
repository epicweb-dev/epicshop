import { json } from '@remix-run/node'
import { getApps } from '~/utils/misc.server'

export async function loader() {
	const apps = await getApps()
	return json({ apps })
}
