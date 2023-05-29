import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import express from 'express'
import chokidar from 'chokidar'
import compression from 'compression'
import morgan from 'morgan'
import address from 'address'
import closeWithGrace from 'close-with-grace'
import { WebSocket, WebSocketServer } from 'ws'
import { createRequestHandler } from '@remix-run/express'
import { type ServerBuild, broadcastDevReady } from '@remix-run/node'
import { getApps, getWorkshopRoot } from '../utils/apps.server.ts'
import { getWatcher } from '../utils/change-tracker.ts'
import getPort, { portNumbers } from 'get-port'
import chalk from 'chalk'

declare global {
	var __server_close_with_grace_return__: ReturnType<typeof closeWithGrace>
}

/*
// FIXME:
	when restarting the server (from tsx watch):
	  (some time the running port is unavailable when we get here again)
		save current running port number
		kill the running port, see kill function from remix.
		https://github.com/remix-run/remix/blob/main/packages/remix-dev/devServer_unstable/index.ts
		start the server again on the same port

	do we need to do everithing again?
		caches already warmed
		all apps already cached

	do we need to close old watcher?
*/

// get some caches warmed up
import('globby')
import('execa')
import('get-port')
import('p-map')

// FIXME: (maybe) - we can complie this file (like in epic-stack) to
// ./server-build/index.js instead of./build/server/remix.js

// we can NOT use `import * as build from '../build/remix.js'`
// since on prod we run this file from a different location with different
// relative path to 'build/index.js'

const BUILD_PATH = path.join(process.cwd(), 'build/remix.js')
const BUILD_PATH_URL = pathToFileURL(BUILD_PATH).href

const build = (await import(BUILD_PATH_URL)) as unknown as ServerBuild
let devBuild = build

// caches all apps
getApps()

const workshopRoot = getWorkshopRoot()

const app = express()

app.use(compression())

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by')

// Remix fingerprints its assets so we can cache forever.
app.use(
	'/build',
	express.static('public/build', { immutable: true, maxAge: '1y' }),
)

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static('public', { maxAge: '1h' }))

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static(path.join(workshopRoot, 'public'), { maxAge: '1h' }))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))

if (process.env.NODE_ENV !== 'production' && !isPublished) {
	morgan.token('url', (req, res) => decodeURIComponent(req.url ?? ''))
	app.use(morgan('tiny'))
}

app.all(
	'*',
	process.env.NODE_ENV === 'development'
		? async (req, res, next) => {
				return createRequestHandler({
					build: devBuild,
					mode: process.env.NODE_ENV,
				})(req, res, next)
		  }
		: createRequestHandler({
				build,
				mode: process.env.NODE_ENV,
		  }),
)

const desiredPort = Number(process.env.PORT || 5639)
const portToUse = await getPort({
	port: portNumbers(desiredPort, desiredPort + 100),
})

const server = app.listen(portToUse, () => {
	const addy = server.address()
	const portUsed =
		desiredPort === portToUse
			? desiredPort
			: addy && typeof addy === 'object'
			? addy.port
			: 0

	if (portUsed !== desiredPort) {
		console.warn(
			chalk.yellow(
				`⚠️  Port ${desiredPort} is not available, using ${portUsed} instead.`,
			),
		)
	}
	console.log(`🐨  Let's get learning!`)
	const localUrl = `http://localhost:${portUsed}`
	let lanUrl: string | null = null
	const localIp = address.ip()
	// Check if the address is a private ip
	// https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
	// https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/react-dev-utils/WebpackDevServerUtils.js#LL48C9-L54C10
	if (/^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(localIp)) {
		lanUrl = `http://${localIp}:${portUsed}`
	}

	console.log(
		`
${chalk.bold('Local:')}            ${chalk.cyan(localUrl)}
${lanUrl ? `${chalk.bold('On Your Network:')}  ${chalk.cyan(lanUrl)}` : ''}
${chalk.bold('Press Ctrl+C to stop')}
	`.trim(),
	)

	if (process.env.NODE_ENV === 'development') {
		broadcastDevReady(build)
	}
})

const wss = new WebSocketServer({ server, path: '/__ws' })

getWatcher().on('all', (event, filePath, stats) => {
	for (const client of wss.clients) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(
				JSON.stringify({
					type: 'kcdshop:file-change',
					data: { event, filePath, stats },
				}),
			)
		}
	}
})

global.__server_close_with_grace_return__?.uninstall()

global.__server_close_with_grace_return__ = closeWithGrace(() => {
	return Promise.all([
		new Promise((resolve, reject) => {
			server.close(e => (e ? reject(e) : resolve('ok')))
		}),
		new Promise((resolve, reject) => {
			wss.close(e => (e ? reject(e) : resolve('ok')))
		}),
	])
})

// during dev, we'll keep the build module up to date with the changes
if (process.env.NODE_ENV === 'development') {
	async function reloadBuild() {
		devBuild = await import(`${BUILD_PATH_URL}?update=${Date.now()}`)
		broadcastDevReady(devBuild)
	}
	// watch for changes in remix.js and utils
	const watchPath = path.dirname(BUILD_PATH).replace(/\\/g, '/') + '/**.*'
	const watcher = chokidar.watch(watchPath, {
		ignored: ['**/**.map'],
		ignoreInitial: true,
	})
	watcher.on('all', reloadBuild)
}
