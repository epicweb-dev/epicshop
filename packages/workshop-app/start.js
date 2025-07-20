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
	
	// Parse current version
	const [currentMajor, currentMinor = 0, currentPatch = 0] = currentNodeVersion
		.split('.')
		.map(v => parseInt(v, 10))
	
	// Check if current version satisfies any of the requirements
	const isSupported = requiredVersions.split('||').some(versionRange => {
		const range = versionRange.trim()
		
		// Handle simple major version (e.g., "20", "22", "24")
		if (/^\d+$/.test(range)) {
			const requiredMajor = parseInt(range, 10)
			return currentMajor === requiredMajor
		}
		
		// Handle x.x format (e.g., "18.x", "20.x")
		if (/^\d+\.x$/i.test(range)) {
			const requiredMajor = parseInt(range.split('.')[0], 10)
			return currentMajor === requiredMajor
		}
		
		// Handle >= operator (e.g., ">=18.0.0")
		if (range.startsWith('>=')) {
			const version = range.slice(2).trim()
			const [reqMajor, reqMinor = 0, reqPatch = 0] = version
				.split('.')
				.map(v => parseInt(v, 10))
			
			if (currentMajor > reqMajor) return true
			if (currentMajor === reqMajor && currentMinor > reqMinor) return true
			if (currentMajor === reqMajor && currentMinor === reqMinor && currentPatch >= reqPatch) return true
			return false
		}
		
		// Handle > operator (e.g., ">18.0.0")
		if (range.startsWith('>') && !range.startsWith('>=')) {
			const version = range.slice(1).trim()
			const [reqMajor, reqMinor = 0, reqPatch = 0] = version
				.split('.')
				.map(v => parseInt(v, 10))
			
			if (currentMajor > reqMajor) return true
			if (currentMajor === reqMajor && currentMinor > reqMinor) return true
			if (currentMajor === reqMajor && currentMinor === reqMinor && currentPatch > reqPatch) return true
			return false
		}
		
		// Handle <= operator (e.g., "<=20.0.0")
		if (range.startsWith('<=')) {
			const version = range.slice(2).trim()
			const [reqMajor, reqMinor = 0, reqPatch = 0] = version
				.split('.')
				.map(v => parseInt(v, 10))
			
			if (currentMajor < reqMajor) return true
			if (currentMajor === reqMajor && currentMinor < reqMinor) return true
			if (currentMajor === reqMajor && currentMinor === reqMinor && currentPatch <= reqPatch) return true
			return false
		}
		
		// Handle < operator (e.g., "<22.0.0")
		if (range.startsWith('<') && !range.startsWith('<=')) {
			const version = range.slice(1).trim()
			const [reqMajor, reqMinor = 0, reqPatch = 0] = version
				.split('.')
				.map(v => parseInt(v, 10))
			
			if (currentMajor < reqMajor) return true
			if (currentMajor === reqMajor && currentMinor < reqMinor) return true
			if (currentMajor === reqMajor && currentMinor === reqMinor && currentPatch < reqPatch) return true
			return false
		}
		
		// Handle caret range (e.g., "^18.0.0") - compatible within same major version
		if (range.startsWith('^')) {
			const version = range.slice(1).trim()
			const [reqMajor, reqMinor = 0, reqPatch = 0] = version
				.split('.')
				.map(v => parseInt(v, 10))
			
			if (currentMajor !== reqMajor) return false
			if (currentMinor > reqMinor) return true
			if (currentMinor === reqMinor && currentPatch >= reqPatch) return true
			return false
		}
		
		// Handle tilde range (e.g., "~22.1.0") - compatible within same minor version
		if (range.startsWith('~')) {
			const version = range.slice(1).trim()
			const [reqMajor, reqMinor = 0, reqPatch = 0] = version
				.split('.')
				.map(v => parseInt(v, 10))
			
			if (currentMajor !== reqMajor || currentMinor !== reqMinor) return false
			return currentPatch >= reqPatch
		}
		
		// Handle exact version (e.g., "18.0.0")
		if (/^\d+\.\d+\.\d+$/.test(range)) {
			const [reqMajor, reqMinor, reqPatch] = range
				.split('.')
				.map(v => parseInt(v, 10))
			
			return currentMajor === reqMajor && currentMinor === reqMinor && currentPatch === reqPatch
		}
		
		// Fallback: try to parse as simple major version
		const parsedMajor = parseInt(range, 10)
		if (!isNaN(parsedMajor)) {
			return currentMajor === parsedMajor
		}
		
		return false
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
