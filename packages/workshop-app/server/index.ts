import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPresentUsers } from '@kentcdodds/workshop-presence/presence.server'
import {
	getApps,
	getWorkshopRoot,
} from '@kentcdodds/workshop-utils/apps.server'
import { getWatcher } from '@kentcdodds/workshop-utils/change-tracker.server'
import { isEmbeddedFile } from '@kentcdodds/workshop-utils/compile-mdx.server'
import { checkForUpdates } from '@kentcdodds/workshop-utils/git.server'
import { createRequestHandler } from '@remix-run/express'
import {
	type ServerBuild,
	broadcastDevReady,
	installGlobals,
} from '@remix-run/node'
import { ip as ipAddress } from 'address'
import chalk from 'chalk'
import chokidar from 'chokidar'
import closeWithGrace from 'close-with-grace'
import compression from 'compression'
import express from 'express'
import getPort, { portNumbers } from 'get-port'
import morgan from 'morgan'
import sourceMapSupport from 'source-map-support'
import { WebSocket, WebSocketServer } from 'ws'

// @ts-ignore - this file may not exist if you haven't built yet, but it will
// definitely exist by the time the dev or prod server actually runs.
import * as remixBuild from '../build/index.js'

const BUILD_PATH = '../build/index.js'

installGlobals()
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

// kick this off early...
const hasUpdatesPromise = checkForUpdates()
// caches all apps
getApps()
getPresentUsers()

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

const server = app.listen(portToUse, async () => {
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
	const localIp = ipAddress() ?? 'Unknown'
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

	const hasUpdates = await hasUpdatesPromise
	if (hasUpdates.updatesAvailable) {
		const updateCommand = chalk.blue.bold.bgWhite(' npx kcdshop update ')
		const updateLink = chalk.blue.bgWhite(` ${hasUpdates.diffLink} `)
		console.log(
			'\n',
			`🎉  There are ${chalk.yellow(
				'updates available',
			)} for this workshop repository.  🎉\n\nTo get the updates, stop the server and run the following command:\n\n  ${updateCommand}\n\nTo view a diff, check:\n  ${updateLink}`,
		)
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
