import path from 'path'
import dotenv from 'dotenv'

process.env.NODE_ENV ??= 'development'
const EPICSHOP_CONTEXT_CWD = process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd()
dotenv.config({
	path: path.join(EPICSHOP_CONTEXT_CWD, '.env'),
})

if (process.env.NODE_ENV === 'production') {
	await import('./dist/server/index.js').catch((err) => {
		console.error('Encountered error importing the server, exiting...')
		console.error(err)
		process.exit(1)
	})
} else {
	await import('./server/index.ts').catch((err) => {
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
