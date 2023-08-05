import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

if (process.env.KCDSHOP_LOG_MEMORY) {
	function logMemory() {
		const memoryUsage = process.memoryUsage()
		const heapTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024)
		const heapUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024)
		const rss = Math.round(memoryUsage.rss / 1024 / 1024)
		console.log('Memory (MB): ', { heapTotal, heapUsed, rss })
	}
	logMemory()
	setInterval(logMemory, 200)
}

const KCDSHOP_CONTEXT_CWD = process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()
dotenv.config({
	path: path.join(KCDSHOP_CONTEXT_CWD, '.env'),
})

let packageJson
try {
	packageJson = JSON.parse(
		await fs.promises.readFile(
			path.join(KCDSHOP_CONTEXT_CWD, 'package.json'),
			'utf8',
		),
	)
} catch (error) {
	throw new Error(`Could not find package.json at ${KCDSHOP_CONTEXT_CWD}`)
}

if (packageJson['kcd-workshop'].githubRoot) {
	process.env.KCDSHOP_GITHUB_ROOT = packageJson['kcd-workshop'].githubRoot
} else {
	throw new Error(
		`Could not set the KCDSHOP_GITHUB_ROOT environment variable. Please set it to the URL of your GitHub repo in the "kcd-workshop.githubRoot" property of the package.json.`,
	)
}

if (process.env.NODE_ENV === 'production') {
	await import('./build/server/index.js').catch(err => {
		console.error(err)
		process.exit(1)
	})
} else {
	await import('./server/index.ts').catch(err => {
		console.error(err)
		process.exit(1)
	})
}
