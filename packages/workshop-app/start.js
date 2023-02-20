if (process.env.NODE_ENV === 'production') {
	require('./build/server')
} else {
	if (!global.__inspector_open__) {
		global.__inspector_open__ = true
		require('inspector').open()
	}
	require('./server')
}
