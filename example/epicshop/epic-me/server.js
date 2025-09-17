console.log('🚀 Epic Me App starting...')

setInterval(() => {
	console.log('📊 Epic Me App is running at', new Date().toISOString())
}, 5000)

setInterval(() => {
	console.error('⚠️ Epic Me App warning message')
}, 7000)

console.log('✅ Epic Me App started successfully')

// Keep the process running
process.on('SIGTERM', () => {
	console.log('📝 Epic Me App received SIGTERM, shutting down...')
	process.exit(0)
})

process.on('SIGINT', () => {
	console.log('📝 Epic Me App received SIGINT, shutting down...')
	process.exit(0)
})
