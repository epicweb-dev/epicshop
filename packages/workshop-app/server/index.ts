import path from 'path'
import { fileURLToPath } from 'url'
import { debuglog } from 'util'
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'
import {
	getApps,
	getModifiedTimeForFile,
	getWorkshopRoot,
	init as initApps,
	setModifiedTimesForAppDirs,
} from '@epic-web/workshop-utils/apps.server'
import {
	getWorkshopConfig,
	getWorkshopUrl,
} from '@epic-web/workshop-utils/config.server'
import { getEnv, init as initEnv } from '@epic-web/workshop-utils/env.server'
import { warmCache as warmEpicAPICache } from '@epic-web/workshop-utils/epic-api.server'
import { warmOfflineVideoSummary } from '@epic-web/workshop-utils/offline-videos.server'
import { requestContext } from '@epic-web/workshop-utils/request-context.server'
import { checkConnection } from '@epic-web/workshop-utils/utils.server'
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
global.ENV = getEnv()

const MODE = process.env.NODE_ENV ?? 'development'
const isProd = MODE === 'production'

void initApps().catch(() => {})
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

// warm up some caches
void Promise.all([
	getApps(),
	checkConnection(),
	getPresentUsers(),
	warmEpicAPICache(),
	warmOfflineVideoSummary(),
]).catch(() => {}) // don't block startup

const serverBuildPromise = getBuild()

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

if (
	(!isProd && !ENV.EPICSHOP_IS_PUBLISHED) ||
	ENV.EPICSHOP_DEPLOYED ||
	debuglog('epic:req').enabled
) {
	morgan.token('url', (req) => decodeURIComponent(req.url ?? ''))
	const ignore = [/^\/__manifest/]
	app.use(
		morgan('tiny', {
			skip: (req, _res) => ignore.some((pattern) => pattern.test(req.url)),
		}),
	)
}

app.use((_req, _res, next) => requestContext.run({}, next))

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

const desiredPort = Number(process.env.PORT || 5639)
const portToUse = await getPort({
	port: portNumbers(desiredPort, desiredPort + 100),
})

app.all(
	'*splat',
	createRequestHandler({
		getLoadContext: () => ({ serverBuild: serverBuildPromise }),
		mode: MODE,
		build: () => serverBuildPromise,
	}),
)

const SENTRY_ENABLED = Boolean(
	ENV.EPICSHOP_IS_PUBLISHED && process.env.SENTRY_DSN,
)

if (SENTRY_ENABLED) {
	const Sentry = await import('@sentry/react-router')
	Sentry.setTag('github_repo', ENV.EPICSHOP_GITHUB_REPO || 'unknown')
	Sentry.setTag('deployed', ENV.EPICSHOP_DEPLOYED ? 'true' : 'false')
	Sentry.setTag('app_version', ENV.EPICSHOP_APP_VERSION || 'unknown')
	Sentry.setTag('environment', ENV.MODE || 'development')
	Sentry.setupExpressErrorHandler(app)
}

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

	// send request to self to warm things up
	void fetch(`http://localhost:${portUsed}`, { method: 'HEAD' }).catch(() => {})

	if (portUsed !== desiredPort) {
		console.warn(
			chalk.yellow(
				`⚠️  Port ${desiredPort} is not available, using ${portUsed} instead.`,
			),
		)
	}
	console.log(`🐨  Let's get learning!`)

	const localUrl = getWorkshopUrl(portUsed)

	console.log(
		`
${chalk.bold('Local:')}            ${chalk.cyan(localUrl)}
${lanUrl ? `${chalk.bold('On Your Network:')}  ${chalk.cyan(lanUrl)}` : ''}
	`.trim(),
	)
	// give it another line
	console.log('')

	// Start sidecar processes if configured
	try {
		const workshopConfig = getWorkshopConfig()
		if (
			workshopConfig.sidecarProcesses &&
			Object.keys(workshopConfig.sidecarProcesses).length > 0 &&
			!ENV.EPICSHOP_DEPLOYED
		) {
			console.log(chalk.blue('🚀 Starting sidecar processes...'))
			const { startSidecarProcesses } =
				await import('@epic-web/workshop-utils/process-manager.server')
			startSidecarProcesses(workshopConfig.sidecarProcesses)
		}
	} catch (error) {
		console.error(chalk.red('❌ Failed to start sidecar processes:'), error)
	}

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
				const workshopUrl = getWorkshopUrl(portToUse)
				const isValidOrigin =
					origin &&
					(origin === workshopUrl ||
						origin === `http://localhost:${portToUse}` ||
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
						watcher.chok.on('all', async (event, filePath, stats) => {
							const absoluteFilepath = path.join(getWorkshopRoot(), filePath)
							setModifiedTimesForAppDirs(
								stats?.mtimeMs ??
									(await getModifiedTimeForFile(absoluteFilepath)) ??
									Date.now(),
								absoluteFilepath,
							)
							fileChanges.add(absoluteFilepath)
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
							void watcher.chok.close().catch(() => {})
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
})

closeWithGrace(async () => {
	const result = await new Promise((resolve, reject) => {
		server.close((e) => (e ? reject(e) : resolve(null)))
	})
	return result
})
