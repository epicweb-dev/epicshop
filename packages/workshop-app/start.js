const dotenv = require('dotenv')
const path = require('path')

dotenv.config({
	path: path.join(process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(), '.env'),
})

if (process.env.NODE_ENV === 'production') {
	require('./build/server')
} else {
	if (!global.__inspector_open__) {
		global.__inspector_open__ = true
		require('inspector').open()
	}
	require('./server')
}
