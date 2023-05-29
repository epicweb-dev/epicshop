import dotenv from 'dotenv'
import path from 'path'

dotenv.config({
	path: path.join(process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(), '.env'),
})

if (process.env.NODE_ENV === 'production') {
	await import('./build/server/index.js')
} else {
	// FIXME: global.__inspector_open__ is always undefined here, even when the inspectore runing
	if (!global.__inspector_open__) {
		global.__inspector_open__ = true
		const inspector = await import('inspector')
		inspector.open()
	}
	await import('./server/index.ts')
}
