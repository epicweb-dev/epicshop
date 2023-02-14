import type { DataFunctionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppById } from '~/utils/misc.server'
import { redirect } from 'react-router'

export async function loader({ params }: DataFunctionArgs) {
	const { id: appId } = params
	invariant(appId, 'App id is required')
	const app = await getAppById(appId)
	if (!app) {
		throw new Response(`App "${appId}" not found`, { status: 404 })
	}
	if (app.dev.type === 'script') {
		return redirect(app.dev.baseUrl)
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
