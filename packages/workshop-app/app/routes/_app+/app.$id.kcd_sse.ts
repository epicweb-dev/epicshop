import { eventStream } from 'remix-utils'
import { chokidar } from '~/utils/watch.server'
import type { DataFunctionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppById } from '~/utils/misc.server'
import { redirect } from 'react-router'

export async function loader({ request, params }: DataFunctionArgs) {
	const { id: appId } = params
	invariant(appId, 'App id is required')
	const app = await getAppById(appId)
	if (!app) {
		throw new Response(`App "${appId}" not found`, { status: 404 })
	}
	if (app.dev.type === 'script') {
		return redirect(app.dev.baseUrl)
	}
	return eventStream(request.signal, function setup(send) {
		const watcher = chokidar
			.watch(app.fullPath, { ignoreInitial: true })
			.on('all', () => {
				send({ event: 'reload', data: '' })
			})
		return function cleanup() {
			watcher.close()
		}
	})
}
