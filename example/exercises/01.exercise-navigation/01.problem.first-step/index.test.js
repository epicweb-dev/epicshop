import { test, expect } from 'vitest'

test('server responds with goodbye world', async () => {
	process.env.PORT = '0'
	const { server } = await import('./index.js')
	await new Promise((resolve) => {
		server.once('listening', resolve)
	})

	try {
		const port = server.address().port
		const response = await fetch(`http://localhost:${port}`)
		const text = await response.text()
		expect(text).toBe('goodbye world')
	} finally {
		await new Promise((resolve) => {
			server.close(resolve)
		})
	}
})
