import type { DataFunctionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppByName } from '~/utils/misc.server'
import { redirect } from 'react-router'

export async function loader({ params }: DataFunctionArgs) {
	const { name: appName } = params
	invariant(appName, 'App name is required')
	const app = await getAppByName(appName)
	if (!app) {
		throw new Response(`App "${appName}" not found`, { status: 404 })
	}
	if (app.hasServer) {
		return redirect(app.baseUrl)
	}
	const js = /* javascript */ `
new EventSource('kcd_sse').addEventListener('reload', () => location.reload());
`
	return new Response(js, {
		headers: {
			'Content-Length': Buffer.byteLength(js).toString(),
			'Content-Type': 'text/javascript',
		},
	})
}
