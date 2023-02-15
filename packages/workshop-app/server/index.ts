import fs from 'fs'
import fsExtra from 'fs-extra'
import path from 'path'
import express from 'express'
import compression from 'compression'
import morgan from 'morgan'
import address from 'address'
import closeWithGrace from 'close-with-grace'
import chokidar from 'chokidar'
import ws from 'ws'
import { createRequestHandler } from '@remix-run/express'

const BUILD_DIR_FILE = path.join(process.cwd(), 'build/remix.js')
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

const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))

if (process.env.NODE_ENV !== 'production' && !isPublished) {
	app.use(morgan('tiny'))
}

const port = process.env.PORT || 3000

const server = app.listen(port, async () => {
	const { default: chalk } = await import('chalk')

	console.log(`🐨  Let's get learning!`)
	const localUrl = `http://localhost:${port}`
	let lanUrl: string | null = null
	const localIp = address.ip()
	// Check if the address is a private ip
	// https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
	// https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/react-dev-utils/WebpackDevServerUtils.js#LL48C9-L54C10
	if (/^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(localIp)) {
		lanUrl = `http://${localIp}:${port}`
	}

	console.log(
		`
${chalk.bold('Local:')}            ${chalk.cyan(localUrl)}
${lanUrl ? `${chalk.bold('On Your Network:')}  ${chalk.cyan(lanUrl)}` : ''}
${chalk.bold('Press Ctrl+C to stop')}
	`.trim(),
	)
})

const wss = new ws.Server({ server, path: '/__ws' })

const watcher = chokidar
	.watch(workshopRoot, {
		ignoreInitial: true,
		ignored: [
			'**/node_modules/**',
			'**/build/**',
			'**/public/build/**',
			'**/playwright-report/**',
		],
	})
	.on('all', (event, filePath, stats) => {
		for (const client of wss.clients) {
			if (client.readyState === ws.OPEN) {
				client.send(
					JSON.stringify({
						type: 'kcdshop:file-change',
						data: { event, filePath, stats },
					}),
				)
			}
		}
	})

app.all(
	'*',
	process.env.NODE_ENV === 'development'
		? (req, res, next) => {
				purgeRequireCache()

				return createRequestHandler({
					build: require(BUILD_DIR_FILE),
					mode: process.env.NODE_ENV,
				})(req, res, next)
		  }
		: createRequestHandler({
				build: require(BUILD_DIR_FILE),
				mode: process.env.NODE_ENV,
		  }),
)

closeWithGrace(() => {
	return Promise.all([
		new Promise((resolve, reject) => {
			server.close(e => (e ? reject(e) : resolve('ok')))
		}),
		new Promise((resolve, reject) => {
			wss.close(e => (e ? reject(e) : resolve('ok')))
		}),
		watcher.close(),
	])
})

function purgeRequireCache() {
	// purge require cache on requests for "server side HMR" this won't let
	// you have in-memory objects between requests in development,
	// alternatively you can set up nodemon/pm2-dev to restart the server on
	// file changes, but then you'll have to reconnect to databases/etc on each
	// change. We prefer the DX of this, so we've included it for you by default
	for (const key in require.cache) {
		if (key.startsWith(BUILD_DIR_FILE)) {
			delete require.cache[key]
		}
	}
}

function getWorkshopRoot() {
	const context = process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()
	const { root: rootDir } = path.parse(context)
	let repoRoot = context
	while (repoRoot !== rootDir) {
		const pkgPath = path.join(repoRoot, 'package.json')
		if (fsExtra.pathExistsSync(pkgPath)) {
			const pkg = require(pkgPath)
			if (pkg['kcd-workshop']?.root) {
				return repoRoot
			}
		}
		repoRoot = path.dirname(repoRoot)
	}
	throw new Error(
		`Workshop Root not found. Make sure the root of the workshop has "kcd-workshop" and "root: true" in the package.json.`,
	)
}
