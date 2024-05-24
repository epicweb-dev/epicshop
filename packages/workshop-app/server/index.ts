import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'
import { getApps, getWorkshopRoot } from '@epic-web/workshop-utils/apps.server'
import { getWatcher } from '@epic-web/workshop-utils/change-tracker.server'
import { checkForUpdates } from '@epic-web/workshop-utils/git.server'
import { createRequestHandler } from '@remix-run/express'
import { installGlobals } from '@remix-run/node'
import { ip as ipAddress } from 'address'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import compression from 'compression'
import express from 'express'
import getPort, { portNumbers } from 'get-port'
import morgan from 'morgan'
import sourceMapSupport from 'source-map-support'
import { WebSocket, WebSocketServer } from 'ws'

installGlobals()
sourceMapSupport.install()

const viteDevServer =
	process.env.NODE_ENV === 'production'
		? null
		: await import('vite').then(vite =>
				vite.createServer({
					server: { middlewareMode: true },
				}),
			)

const isProd = process.env.NODE_ENV === 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))
const isDeployed =
	process.env.EPICSHOP_DEPLOYED === 'true' ||
	process.env.EPICSHOP_DEPLOYED === '1'
const isRunningInBuildDir = path.dirname(__dirname).endsWith('dist')
const epicshopAppRootDir = isRunningInBuildDir
	? path.join(__dirname, '..', '..')
	: path.join(__dirname, '..')

// kick this off early...
const hasUpdatesPromise = checkForUpdates()
// caches all apps
void getApps()
void getPresentUsers()

const workshopRoot = getWorkshopRoot()

const app = express()

app.use(compression())

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by')

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
app.use(
	express.static(path.join(workshopRoot, 'public'), {
		maxAge: isProd ? '1h' : 0,
	}),
)

if ((process.env.NODE_ENV !== 'production' && !isPublished) || isDeployed) {
	morgan.token('url', req => decodeURIComponent(req.url ?? ''))
	app.use(morgan('tiny'))
}

function getNumberOrNull(value: unknown) {
	if (value == null) return null
	const number = Number(value)
	return Number.isNaN(number) ? null : number
}

// redirect /1/1 to /01/01 etc.
// and redirect /app/1/1 to /app/01/01 etc.
app.use((req, res, next) => {
	const segments = req.url
		.split('/')
		.map(s => s.trim())
		.filter(Boolean)
	// eslint-disable-next-line prefer-const
	let [first, second, ...rest] = segments
	let leading = ''
	if (segments[0] === 'app') {
		leading = '/app'
		;[first, second, ...rest] = segments.slice(1)
	}
	const firstNumber = getNumberOrNull(first)
	const secondNumber = getNumberOrNull(second)
	if (firstNumber === null && secondNumber === null) return next()

	if (firstNumber != null) first = firstNumber.toString().padStart(2, '0')
	if (secondNumber != null) second = secondNumber.toString().padStart(2, '0')
	const updatedUrl = `${leading}/${[first, second, ...rest].filter(Boolean).join('/')}`
	if (req.url !== updatedUrl) {
		return res.redirect(302, updatedUrl)
	}
	next()
})

app.all(
	'*',
	createRequestHandler({
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		build: viteDevServer
			? () => viteDevServer.ssrLoadModule('virtual:remix/server-build')
			: // @ts-ignore (this may or may not be built at this time, but it will be in prod)
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
				((await import('#build/server/index.js')) as any),
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
	const localIp: string = ipAddress() ?? 'Unknown'
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

	const hasUpdates = await hasUpdatesPromise
	if (hasUpdates.updatesAvailable) {
		const updateCommand = chalk.blue.bold.bgWhite(' npx update-epic-workshop ')
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

let timer: NodeJS.Timeout | null = null
let fileChanges = new Set<string>()

getWatcher()?.on('all', (event, filePath) => {
	fileChanges.add(filePath)

	if (!timer) {
		timer = setTimeout(() => {
			if (fileChanges.size === 0) return
			for (const client of wss.clients) {
				if (client.readyState === WebSocket.OPEN) {
					client.send(
						JSON.stringify({
							type: 'epicshop:file-change',
							data: { event, filePaths: Array.from(fileChanges) },
						}),
					)
				}
			}

			fileChanges = new Set()
			timer = null
		}, 50)
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
