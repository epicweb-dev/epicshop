import dotenv from 'dotenv'
import path from 'path'

dotenv.config({
	path: path.join(process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(), '.env'),
})

if (process.env.NODE_ENV === 'production') {
	await import('./build/server/index.js')
} else {
	await import('./server/index.ts')
}
