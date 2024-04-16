import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const EPICSHOP_CONTEXT_CWD = process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()
dotenv.config({
	path: path.join(EPICSHOP_CONTEXT_CWD, '.env'),
})

let packageJson
try {
	packageJson = JSON.parse(
		await fs.promises.readFile(
			path.join(EPICSHOP_CONTEXT_CWD, 'package.json'),
			'utf8',
		),
	)
} catch (error) {
	throw new Error(`Could not find package.json at ${EPICSHOP_CONTEXT_CWD}`)
}

if (packageJson.epicshop.githubRoot) {
	process.env.EPICSHOP_GITHUB_ROOT = packageJson.epicshop.githubRoot
} else {
	throw new Error(
		`Could not set the EPICSHOP_GITHUB_ROOT environment variable. Please set it to the URL of your GitHub repo in the "epicshop.githubRoot" property of the package.json.`,
	)
}

if (process.env.NODE_ENV === 'production') {
	await import('./dist/server/index.js').catch(err => {
		console.error('Encountered error importing the server, exiting...')
		console.error(err)
		process.exit(1)
	})
} else {
	await import('./server/index.ts').catch(err => {
		console.error('Encountered error importing the server, exiting...')
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
