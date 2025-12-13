import assert from 'node:assert'
import test from 'node:test'

test('server responds with goodbye world', async (t) => {
	process.env.PORT ??= 4000
	const { server } = await import('./index.js')
	await new Promise((resolve) => {
		server.once('listening', resolve)
	})

	try {
		const response = await fetch(`http://localhost:${process.env.PORT}`)
		const text = await response.text()
		assert.strictEqual(
			text,
			'goodbye world',
			'🚨 Make sure to update the server response to say "goodbye world" instead of "hello world"',
		)
	} finally {
		await new Promise((resolve) => {
			server.close(resolve)
		})
	}
})
