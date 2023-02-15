import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { alfredTip, expect } from '@kentcdodds/workshop-app/test'
import '.'

const button = await alfredTip(
	() => screen.findByRole('button', { name: /0/i }),
	'Could not find the counter button. It should start at 0',
)
await userEvent.click(button)
await alfredTip(
	() => waitFor(() => expect(button).to.have.text('1')),
	'The button text should be 1 after clicking it once',
)
await userEvent.click(button)
await alfredTip(
	() => waitFor(() => expect(button).to.have.text('1')),
	'The button text should be 2 after clicking it a second time',
)
