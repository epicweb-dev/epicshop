import assert from 'node:assert'
import test from 'node:test'

test('server responds with counter app HTML', async (t) => {
	process.env.PORT ??= 4000
	const { server } = await import('./index.js')
	await new Promise((resolve) => {
		server.once('listening', resolve)
	})

	try {
		const response = await fetch(`http://localhost:${process.env.PORT}`)
		const text = await response.text()

		// Verify it's HTML
		assert.ok(
			response.headers.get('content-type').includes('text/html'),
			'Response should be HTML',
		)

		// Verify the HTML contains key elements of the counter app
		assert.ok(
			text.includes('<title>Counter App</title>'),
			'HTML should include Counter App title',
		)
		assert.ok(text.includes('id="count"'), 'HTML should include count element')
		assert.ok(
			text.includes('id="increment"'),
			'HTML should include increment button',
		)
		assert.ok(
			text.includes('let count = 0'),
			'HTML should include counter JavaScript logic',
		)
		assert.ok(
			text.includes('button.addEventListener'),
			'HTML should include event listener for button clicks',
		)
		assert.ok(
			text.includes('count++'),
			'HTML should include code to increment the count',
		)
	} finally {
		await new Promise((resolve) => {
			server.close(resolve)
		})
	}
})
