import { eventStream } from 'remix-utils'
import { chokidar } from '~/utils/watch.server'
import type { DataFunctionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppByName } from '~/utils/misc.server'
import { redirect } from 'react-router'

export async function loader({ request, params }: DataFunctionArgs) {
	const { name: appName } = params
	invariant(appName, 'App name is required')
	const app = await getAppByName(appName)
	if (!app) {
		throw new Response(`App "${appName}" not found`, { status: 404 })
	}
	if (app.hasServer) {
		return redirect(app.baseUrl)
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
