import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'

const packageJson = JSON.parse(
	await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf-8'),
)

// Check Node.js version against the engines requirement
function checkNodeVersion() {
	const currentNodeVersion = process.version.slice(1) // Remove 'v' prefix
	const requiredVersions = packageJson.engines?.node
	
	if (!requiredVersions) {
		return // No engines specified, skip check
	}
	
	// Parse the semver range (e.g., "20 || 22 || 24")
	const majorVersions = requiredVersions.split('||').map(v => v.trim())
	const currentMajorVersion = parseInt(currentNodeVersion.split('.')[0])
	
	const isSupported = majorVersions.some(version => {
		const requiredMajorVersion = parseInt(version)
		return currentMajorVersion === requiredMajorVersion
	})
	
	if (!isSupported) {
		console.error('\n❌ Node.js version compatibility error')
		console.error(`Current Node.js version: v${currentNodeVersion}`)
		console.error(`Required Node.js versions: ${requiredVersions}`)
		console.error('\nThis project only supports LTS versions of Node.js.')
		console.error('Please update to a supported Node.js version and try again.')
		console.error('\nYou can download the latest LTS version from: https://nodejs.org/')
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
