import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import semver from 'semver'

const packageJson = JSON.parse(
	await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf-8'),
)

// Check Node.js version against the engines requirement
function checkNodeVersion() {
	if (
		process.env.EPICSHOP_SKIP_NODE_VERSION_CHECK === 'true' ||
		process.env.EPICSHOP_SKIP_NODE_VERSION_CHECK === '1'
	) {
		return
	}

	const currentNodeVersion = process.version.slice(1) // Remove 'v' prefix
	const requiredVersions = packageJson.engines?.node

	if (!requiredVersions) {
		return // No engines specified, skip check
	}

	// Use semver to check if current version satisfies the requirement
	const isSupported = semver.satisfies(currentNodeVersion, requiredVersions)

	if (!isSupported) {
		console.error('\n❌ Node.js version compatibility error')
		console.error(`Current Node.js version: v${currentNodeVersion}`)
		console.error(`Required Node.js versions: ${requiredVersions}`)
		console.error(
			`\nThis project only supports versions of Node.js which match the semver range specified in the package.json file`,
		)
		console.error('Please update to a supported Node.js version and try again.')
		console.error(
			'\nYou can download the latest LTS version from: https://nodejs.org/',
		)
		process.exit(1)
	}
}

checkNodeVersion()

process.env.EPICSHOP_APP_VERSION ??= packageJson.version
process.env.EPICSHOP_IS_PUBLISHED ??= packageJson.version.includes('0.0.0')
	? 'false'
	: 'true'
process.env.EPICSHOP_APP_LOCATION ??= path.dirname(
	new URL(import.meta.url).pathname,
)
process.env.NODE_ENV ??= 'development'
process.env.EPICSHOP_ENABLE_WATCHER ??= 'true'
const EPICSHOP_CONTEXT_CWD = process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()
dotenv.config({
	quiet: true,
	path: path.join(EPICSHOP_CONTEXT_CWD, '.env'),
})

if (process.env.NODE_ENV === 'production') {
	await import('./dist/server/index.js').catch((err) => {
		console.error(
			'Encountered error importing the production server, exiting...',
		)
		console.error(err)
		process.exit(1)
	})
} else {
	await import('./server/index.ts').catch((err) => {
		console.error(
			'Encountered error importing the development server, exiting...',
		)
		console.error(err)
		process.exit(1)
	})
}

process.on('unhandledRejection', (reason, promise) => {
	console.error(
		'Unhandled Rejection for: ',
		promise,
		'\nWith the reason: ',
		reason,
	)
	throw reason
})
