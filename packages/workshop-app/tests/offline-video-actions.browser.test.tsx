import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { OfflineVideoActionButtons } from '#app/components/offline-video-actions.tsx'

test('shows download action when offline copy is missing (aha)', async () => {
	await render(
		<OfflineVideoActionButtons
			isAvailable={false}
			onDownload={() => {}}
			onDelete={() => {}}
		/>,
	)

	await expect
		.element(page.getByRole('button', { name: 'Download offline video' }))
		.toBeVisible()
})

test('shows delete action when offline copy is ready', async () => {
	await render(
		<OfflineVideoActionButtons
			isAvailable={true}
			onDownload={() => {}}
			onDelete={() => {}}
		/>,
	)

	await expect
		.element(page.getByRole('button', { name: 'Delete offline video' }))
		.toBeVisible()
})

test('disables actions while busy', async () => {
	await render(
		<OfflineVideoActionButtons
			isAvailable={false}
			isBusy={true}
			onDownload={() => {}}
			onDelete={() => {}}
		/>,
	)

	await expect
		.element(page.getByRole('button', { name: 'Download offline video' }))
		.toBeDisabled()
})
