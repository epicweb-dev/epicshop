import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { OfflineVideoActionButtons } from '#app/components/offline-video-actions.tsx'
import { TooltipProvider } from '#app/components/ui/tooltip.tsx'

test('shows download action when offline copy is missing (aha)', async () => {
	await render(
		<TooltipProvider>
			<OfflineVideoActionButtons
				isAvailable={false}
				onDownload={() => {}}
				onDelete={() => {}}
			/>
		</TooltipProvider>,
	)

	await expect
		.element(page.getByRole('button', { name: 'Download offline video' }))
		.toBeVisible()
})

test('shows delete action when offline copy is ready', async () => {
	await render(
		<TooltipProvider>
			<OfflineVideoActionButtons
				isAvailable={true}
				onDownload={() => {}}
				onDelete={() => {}}
			/>
		</TooltipProvider>,
	)

	await expect
		.element(page.getByRole('button', { name: 'Delete offline video' }))
		.toBeVisible()
})

test('disables actions while busy', async () => {
	await render(
		<TooltipProvider>
			<OfflineVideoActionButtons
				isAvailable={false}
				isBusy={true}
				onDownload={() => {}}
				onDelete={() => {}}
			/>
		</TooltipProvider>,
	)

	await expect
		.element(page.getByRole('button', { name: 'Download offline video' }))
		.toBeDisabled()
})
