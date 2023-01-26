import fs from 'fs'
import path from 'path'
import express from 'express'
import compression from 'compression'
import morgan from 'morgan'
import address from 'address'
import { createRequestHandler } from '@remix-run/express'

const BUILD_DIR = path.join(process.cwd(), 'build')

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

const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))

if (process.env.NODE_ENV !== 'production' && !isPublished) {
	app.use(morgan('tiny'))
}

app.all(
	'*',
	process.env.NODE_ENV === 'development'
		? (req, res, next) => {
				purgeRequireCache()

				return createRequestHandler({
					build: require(BUILD_DIR),
					mode: process.env.NODE_ENV,
				})(req, res, next)
		  }
		: createRequestHandler({
				build: require(BUILD_DIR),
				mode: process.env.NODE_ENV,
		  }),
)
const port = process.env.PORT || 3000

app.listen(port, async () => {
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

	// draw a box around the output
	console.log(
		`
${chalk.bold('Local:')}            ${chalk.cyan(localUrl)}
${lanUrl ? `${chalk.bold('On Your Network:')}  ${chalk.cyan(lanUrl)}` : ''}
${chalk.bold('Press Ctrl+C to stop')}
	`.trim(),
	)
})

function purgeRequireCache() {
	// purge require cache on requests for "server side HMR" this won't let
	// you have in-memory objects between requests in development,
	// alternatively you can set up nodemon/pm2-dev to restart the server on
	// file changes, but then you'll have to reconnect to databases/etc on each
	// change. We prefer the DX of this, so we've included it for you by default
	for (const key in require.cache) {
		if (key.startsWith(BUILD_DIR)) {
			delete require.cache[key]
		}
	}
}
