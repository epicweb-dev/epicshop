import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { TooltipProvider } from '#app/components/ui/tooltip.tsx'
import { ProgressToggleCheckIndicator } from '#app/routes/progress.tsx'

test('shows queued tooltip on completed check marker', async () => {
	await render(
		<TooltipProvider delayDuration={0}>
			<div className="group">
				<ProgressToggleCheckIndicator
					optimisticCompleted={true}
					showQueuedCheckTooltip={true}
				/>
			</div>
		</TooltipProvider>,
	)

	const queuedMarker = page.getByLabelText(
		'Progress is saved locally and waiting to sync',
	)
	await expect.element(queuedMarker).toBeVisible()

	await queuedMarker.hover()
	await expect
		.element(page.getByText('Saved locally. Waiting to sync online.'))
		.toBeVisible()
})
