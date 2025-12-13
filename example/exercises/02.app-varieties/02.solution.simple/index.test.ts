import { expect, testStep, dtl } from '@epic-web/workshop-utils/test'
const { screen, fireEvent } = dtl

import './index.js'

const button = await testStep('Button is rendered', () =>
	screen.findByRole('button', { name: /click me/i }),
)

await testStep('Button opens YouTube link when clicked', () => {
	// the alert is a little irritating here
	const originalAlert = window.alert
	window.alert = () => {}

	const originalOpen = window.open
	let openedUrl = ''
	let called = false
	window.open = (url) => {
		called = true
		openedUrl = url as string
		return null
	}

	fireEvent.click(button)

	expect(called, '🚨 window.open should be called').toBe(true)
	expect(
		openedUrl,
		'🚨 window.open should be called with the correct URL',
	).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

	window.open = originalOpen
	window.alert = originalAlert
})
