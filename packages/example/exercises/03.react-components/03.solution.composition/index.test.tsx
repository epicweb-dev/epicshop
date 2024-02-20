import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { testStep, expect } from '@kentcdodds/workshop-utils/test'
import '.'

const button = await testStep(
	'Could not find the counter button. It should start at 0',
	() => screen.findByRole('button', { name: /0/i }),
)
await userEvent.click(button)
await testStep('The button text should be 1 after clicking it once', () =>
	waitFor(() => expect(button).to.have.text('1')),
)
await userEvent.click(button)
await testStep(
	'The button text should be 2 after clicking it a second time',
	() => waitFor(() => expect(button).to.have.text('2')),
)
