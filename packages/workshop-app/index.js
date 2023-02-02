if (process.env.NODE_ENV === 'production') {
	require('./server-build')
} else {
	if (!global.inspectorOpen) {
		global.inspectorOpen = true
		require('inspector').open()
	}
	require('./server')
}
