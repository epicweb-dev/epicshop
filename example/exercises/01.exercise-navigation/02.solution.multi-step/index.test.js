import { test, expect } from 'vitest'

test('server responds with counter app HTML', async () => {
	process.env.PORT = '0'
	const { server } = await import('./index.js')
	await new Promise((resolve) => {
		server.once('listening', resolve)
	})

	try {
		const port = server.address().port
		const response = await fetch(`http://localhost:${port}`)
		const text = await response.text()
		
		// Verify it's HTML
		expect(response.headers.get('content-type')).toContain('text/html')
		
		// Verify the HTML contains key elements of the counter app
		expect(text).toContain('<title>Counter App</title>')
		expect(text).toContain('id="count"')
		expect(text).toContain('id="increment"')
		expect(text).toContain('let count = 0')
		expect(text).toContain('button.addEventListener')
		expect(text).toContain('count++')
	} finally {
		await new Promise((resolve) => {
			server.close(resolve)
		})
	}
})
