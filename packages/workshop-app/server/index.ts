import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequestHandler } from '@remix-run/express'
import { type ServerBuild, broadcastDevReady } from '@remix-run/node'
import address from 'address'
import chalk from 'chalk'
import chokidar from 'chokidar'
import closeWithGrace from 'close-with-grace'
import compression from 'compression'
import express from 'express'
import getPort, { portNumbers } from 'get-port'
import morgan from 'morgan'
import sourceMapSupport from 'source-map-support'
import { WebSocket, WebSocketServer } from 'ws'
import * as remixBuild from '../build/index.js'
import { getApps, getWorkshopRoot } from '../utils/apps.server.ts'
import { getWatcher } from '../utils/change-tracker.ts'
import { isEmbeddedFile } from '../utils/compile-mdx.server.ts'

// @ts-ignore - this file may not exist if you haven't built yet, but it will
// definitely exist by the time the dev or prod server actually runs.

const BUILD_PATH = '../build/index.js'

sourceMapSupport.install()

const build = remixBuild as unknown as ServerBuild
let devBuild = build
const isProd = process.env.NODE_ENV === 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))
const isDeployed =
	process.env.KCDSHOP_DEPLOYED === 'true' ||
	process.env.KCDSHOP_DEPLOYED === '1'
const isRunningInBuildDir = path.dirname(__dirname).endsWith('build')
const kcdshopAppRootDir = isRunningInBuildDir
	? path.join(__dirname, '..', '..')
	: path.join(__dirname, '..')

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
	express.static(path.join(kcdshopAppRootDir, 'public/build'), {
		immutable: true,
		maxAge: '1y',
	}),
)

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(
	express.static(path.join(kcdshopAppRootDir, 'public'), {
		maxAge: isProd ? '1h' : 0,
	}),
)

app.use(
	express.static(path.join(workshopRoot, 'public'), {
		maxAge: isProd ? '1h' : 0,
	}),
)

if ((process.env.NODE_ENV !== 'production' && !isPublished) || isDeployed) {
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

getWatcher()?.on('all', async (event, filePath, stats) => {
	for (const client of wss.clients) {
		if (client.readyState === WebSocket.OPEN) {
			const embeddedFile = await isEmbeddedFile(filePath)
			client.send(
				JSON.stringify({
					type: 'kcdshop:file-change',
					data: { event, filePath, stats, embeddedFile },
				}),
			)
		}
	}
})

closeWithGrace(() => {
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
		devBuild = await import(`${BUILD_PATH}?update=${Date.now()}`)
		broadcastDevReady(devBuild)
	}
	// watch for changes in build/index.js and build/utils
	const watchPath =
		path.join(__dirname, path.dirname(BUILD_PATH)).replace(/\\/g, '/') + '/**.*'
	const watcher = chokidar.watch(watchPath, {
		ignored: ['**/**.map'],
		ignoreInitial: true,
	})
	watcher.on('all', reloadBuild)
}
