if (process.env.NODE_ENV === 'production') {
	require('./build/server')
} else {
	if (!global.inspectorOpen) {
		global.inspectorOpen = true
		require('inspector').open()
	}
	require('./server')
}
