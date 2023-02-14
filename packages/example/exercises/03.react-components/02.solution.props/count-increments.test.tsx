import { screen, waitFor } from '@testing-library/dom'
import assert from 'assert'
import userEvent from '@testing-library/user-event'
import '.'

const button = await screen.findByRole('button', { name: /0/i })
await userEvent.click(button)
await waitFor(() =>
	assert.equal(button.textContent, '1', 'Button text should be 1'),
)
await userEvent.click(button)
await waitFor(() =>
	assert.equal(button.textContent, '2', 'Button text should be 2'),
)
