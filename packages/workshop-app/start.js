const dotenv = require('dotenv')

dotenv.config({ path: process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd() })

if (process.env.NODE_ENV === 'production') {
	require('./build/server')
} else {
	if (!global.__inspector_open__) {
		global.__inspector_open__ = true
		require('inspector').open()
	}
	require('./server')
}
