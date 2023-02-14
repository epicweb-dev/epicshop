import { screen, waitFor } from '@testing-library/dom'
import assert from 'assert'
import userEvent from '@testing-library/user-event'
import '.'

async function test() {
	const button = await screen.findByRole('button', { name: /0/i })
	await userEvent.click(button)
	await waitFor(() =>
		assert.equal(button.textContent, '1', 'Button text should be 1'),
	)
	await userEvent.click(button)
	await waitFor(() =>
		assert.equal(button.textContent, '2', 'Button text should be 2'),
	)
}

const runTestButton = document.createElement('button')
runTestButton.textContent = 'Run tests'
runTestButton.addEventListener('click', runTest, { once: true })
document.body.append(runTestButton)

async function runTest() {
	runTestButton.disabled = true
	runTestButton.textContent = 'Running tests...'
	try {
		await test()
		alert('✅ Test passed.')
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(error.message)
		} else {
			console.error(error)
		}
		alert(`🚨 Test failed. Check console for details.`)
	} finally {
		runTestButton.addEventListener('click', () => window.location.reload())
		runTestButton.disabled = false
		runTestButton.textContent = 'Reload'
	}
}
