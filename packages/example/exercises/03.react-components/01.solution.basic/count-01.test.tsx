import { waitFor, within } from '@testing-library/dom'
import { userEvent } from '@testing-library/user-event'
import { testStep, expect } from '@epic-web/workshop-utils/test'
import '.'

const screen = within(document.body)

const button = await testStep('The counter button should be rendered', () =>
	screen.findByRole('button'),
)

await testStep('The counter button should start at 0', () =>
	expect(button).to.have.text('0'),
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
