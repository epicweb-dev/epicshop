import path from 'path'
import { fileURLToPath } from 'url'
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'
import {
	getApps,
	getWorkshopRoot,
	init as initApps,
	setModifiedTimesForAppDirs,
} from '@epic-web/workshop-utils/apps.server'
import { init as initEnv } from '@epic-web/workshop-utils/env.server'
import { checkForUpdatesCached } from '@epic-web/workshop-utils/git.server'
import { checkConnectionCached } from '@epic-web/workshop-utils/utils.server'
import { createRequestHandler } from '@react-router/express'
import { ip as ipAddress } from 'address'
import chalk from 'chalk'
import chokidar, { type FSWatcher } from 'chokidar'
import closeWithGrace from 'close-with-grace'
import compression from 'compression'
import express from 'express'
import getPort, { portNumbers } from 'get-port'
import morgan from 'morgan'
import { type ServerBuild } from 'react-router'
import sourceMapSupport from 'source-map-support'
import { type WebSocket, WebSocketServer } from 'ws'

// if we exit early with an error, log the error...
closeWithGrace(({ err, manual }) => {
	if (manual) return
	if (err) console.error(err.stack)
})

await initEnv()

const MODE = process.env.NODE_ENV ?? 'development'
const isProd = MODE === 'production'

void initApps()
sourceMapSupport.install()

const viteDevServer = isProd
	? null
	: await import('vite').then((vite) =>
			vite.createServer({
				server: { middlewareMode: true },
				appType: 'custom',
			}),
		)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isRunningInBuildDir = path.dirname(__dirname).endsWith('dist')
const epicshopAppRootDir = isRunningInBuildDir
	? path.join(__dirname, '..', '..')
	: path.join(__dirname, '..')

// kick this off early...
const hasUpdatesPromise = checkForUpdatesCached()
// warm up some caches
void getApps()
void checkConnectionCached()
void getPresentUsers()

const app = express()
app.get(
	'/.well-known/appspecific/com.chrome.devtools.json',
	(req: any, res: any) => {
		return res.status(404).send('Not found')
	},
)

app.use(compression())

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by')

// the workshop's public assets override the app's public assets
app.use(
	express.static(path.join(getWorkshopRoot(), 'public'), {
		maxAge: isProd ? '1h' : 0,
	}),
)

if (viteDevServer) {
	app.use(viteDevServer.middlewares)
} else {
	// Everything else (like favicon.ico) is cached for an hour. You may want to be
	// more aggressive with this caching.
	app.use(
		express.static(path.join(epicshopAppRootDir, 'build/client'), {
			maxAge: isProd ? '1h' : 0,
		}),
	)
}

if ((!isProd && !ENV.EPICSHOP_IS_PUBLISHED) || ENV.EPICSHOP_DEPLOYED) {
	morgan.token('url', (req) => decodeURIComponent(req.url ?? ''))
	app.use(morgan('tiny'))
}

function getNumberOrNull(value: unknown) {
	if (value == null) return null
	const number = Number(value)
	return Number.isNaN(number) ? null : number
}
// redirect /1/1 to /01/01 etc.
// and redirect /app/1/1 to /app/01/01 etc.
// preserve search params
app.use((req, res, next) => {
	const [path = '', search] = req.url.split('?')
	const segments = path
		.split('/')
		.map((s) => s.trim())
		.filter(Boolean)

	let [first, second, ...rest] = segments
	let leading = ''
	if (segments[0] === 'app') {
		leading = '/app'
		;[first, second, ...rest] = segments.slice(1)
	}
	if (segments[0] === 'exercise') {
		leading = '/exercise'
		;[first, second, ...rest] = segments.slice(1)
	}
	const firstNumber = getNumberOrNull(first)
	const secondNumber = getNumberOrNull(second)
	if (firstNumber === null && secondNumber === null) return next()

	if (firstNumber != null) first = firstNumber.toString().padStart(2, '0')
	if (secondNumber != null) second = secondNumber.toString().padStart(2, '0')
	const updatedPath = `${leading}/${[first, second, ...rest].filter(Boolean).join('/')}`
	const updatedUrl = search ? `${updatedPath}?${search}` : updatedPath
	if (req.url !== updatedUrl) {
		return res.redirect(302, updatedUrl)
	}
	next()
})

async function getBuild() {
	const build = viteDevServer
		? viteDevServer.ssrLoadModule('virtual:react-router/server-build')
		: // @ts-ignore this should exist before running the server
			// but it may not exist just yet.
			await import('#build/server/index.js')
	return build as ServerBuild
}

app.all(
	'*splat',
	createRequestHandler({
		getLoadContext: () => ({ serverBuild: getBuild() }),
		mode: MODE,
		build: getBuild,
	}),
)

const desiredPort = Number(process.env.PORT || 5639)
const portToUse = await getPort({
	port: portNumbers(desiredPort, desiredPort + 100),
})

const localIp: string = ipAddress() ?? 'Unknown'
// Check if the address is a private ip
// https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
// https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/react-dev-utils/WebpackDevServerUtils.js#LL48C9-L54C10
const lanUrl = /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
	localIp,
)
	? `http://${localIp}:${portToUse}`
	: null

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

	console.log(
		`
${chalk.bold('Local:')}            ${chalk.cyan(localUrl)}
${lanUrl ? `${chalk.bold('On Your Network:')}  ${chalk.cyan(lanUrl)}` : ''}
	`.trim(),
	)
	// give it another line
	console.log('')

	if (!ENV.EPICSHOP_DEPLOYED && process.env.EPICSHOP_ENABLE_WATCHER) {
		const watches = new Map<
			string,
			{ clients: Set<WebSocket>; chok: FSWatcher }
		>()
		const wss = new WebSocketServer({ noServer: true })

		server.on('upgrade', (request, socket, head) => {
			const url = new URL(request.url ?? '/', 'ws://localhost:0000')
			if (url.pathname === '/__ws') {
				const origin = request.headers.origin
				const isValidOrigin =
					origin &&
					(origin === `http://localhost:${portToUse}` ||
						origin === `http://127.0.0.1:${portToUse}` ||
						(lanUrl && origin === lanUrl))

				if (!isValidOrigin) {
					socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
					socket.destroy()
					return
				}

				wss.handleUpgrade(request, socket, head, (ws) => {
					const watchPaths = url.searchParams.getAll('watch')
					if (watchPaths.length === 0) {
						socket.destroy()
						return
					}
					const key = watchPaths.join('&&')
					let watcher = watches.get(key)
					if (!watcher) {
						const chok = chokidar.watch(watchPaths, {
							cwd: getWorkshopRoot(),
							ignoreInitial: true,
							ignored: [
								`/.git/`,
								`/node_modules/`,
								`/build/`,
								`/server-build/`,
								`/playwright-report/`,
								`/dist/`,
								`/.cache/`,
							],
						})
						watcher = { clients: new Set(), chok }
						watches.set(key, watcher)

						let timer: NodeJS.Timeout | null = null
						let fileChanges = new Set<string>()
						watcher.chok.on('all', (event, filePath) => {
							fileChanges.add(path.join(getWorkshopRoot(), filePath))
							if (timer) return

							timer = setTimeout(async () => {
								for (const client of watcher?.clients ?? []) {
									client.send(
										JSON.stringify({
											type: 'epicshop:file-change',
											data: { event, filePaths: Array.from(fileChanges) },
										}),
									)
								}
								setModifiedTimesForAppDirs(...Array.from(fileChanges))

								fileChanges = new Set()
								timer = null
							}, 50)
						})
					}
					watcher.clients.add(ws)

					ws.on('close', () => {
						watcher?.clients.delete(ws)
						if (watcher?.clients.size === 0) {
							watches.delete(key)
							void watcher.chok.close()
						}
					})
				})
			} else {
				socket.destroy()
			}
		})

		closeWithGrace(async () => {
			await Promise.all([
				...Array.from(watches.values()).map((watcher) => watcher.chok.close()),
				new Promise((resolve, reject) => {
					wss.close((e) => (e ? reject(e) : resolve('ok')))
				}),
			])
		})
	}

	const hasUpdates = await hasUpdatesPromise
	if (hasUpdates.updatesAvailable) {
		const updateCommand = chalk.blue.bold.bgWhite(' npx update-epic-workshop ')
		const updateLink = chalk.blue.bgWhite(` ${hasUpdates.diffLink} `)
		console.log(
			'\n',
			`🎉  There are ${chalk.yellow(
				'updates available',
			)} for this workshop repository.  🎉\n\nTo get the updates, ${chalk.green.bold.bgWhite(
				`press the "u" key`,
			)} or stop the server and run the following command:\n\n  ${updateCommand}\n\nTo view a diff, check:\n  ${updateLink}`,
		)
	}
})

closeWithGrace(async () => {
	const result = await new Promise((resolve, reject) => {
		server.close((e) => (e ? reject(e) : resolve(null)))
	})
	return result
})
