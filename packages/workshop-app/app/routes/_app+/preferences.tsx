import {
	getPreferences,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import { Form, useNavigation, useRouteLoaderData } from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { type RootLoaderData } from '#app/root.tsx'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export async function loader() {
	ensureUndeployed()
	const preferences = await getPreferences()
	return { preferences }
}

export async function action({ request }: { request: Request }) {
	ensureUndeployed()
	const formData = await request.formData()

	const minResolution = formData.get('minResolution')
	const maxResolution = formData.get('maxResolution')
	const fontSize = formData.get('fontSize')
	const optOutPresence = formData.get('optOutPresence') === 'on'
	const persistPlayground = formData.get('persistPlayground') === 'on'
	const dismissExerciseWarning = formData.get('dismissExerciseWarning') === 'on'

	await setPreferences({
		player: {
			minResolution: minResolution ? Number(minResolution) : undefined,
			maxResolution: maxResolution ? Number(maxResolution) : undefined,
		},
		fontSize: fontSize ? Number(fontSize) : undefined,
		presence: { optOut: optOutPresence },
		playground: { persist: persistPlayground },
		exerciseWarning: { dismissed: dismissExerciseWarning },
	})

	return redirectWithToast('/preferences', {
		title: 'Preferences updated',
		description: 'Your preferences have been updated.',
		type: 'success',
	})
}

export default function AccountSettings() {
	const data = useRouteLoaderData('root') as RootLoaderData
	const playerPreferences = data?.preferences?.player
	const fontSizePreference = data?.preferences?.fontSize
	const presencePreferences = data?.preferences?.presence
	const playgroundPreferences = data?.preferences?.playground
	const exerciseWarningPreferences = data?.preferences?.exerciseWarning
	const navigation = useNavigation()

	const isSubmitting = navigation.state === 'submitting'

	return (
		<div className="h-full w-full overflow-y-auto">
			<main className="container mt-12 flex w-full max-w-3xl flex-grow flex-col gap-4 pb-24">
				<h1 className="mb-4 text-h1">Preferences</h1>
				<Form method="post" className="flex w-full max-w-sm flex-col gap-4">
					<div>
						<h2 className="mb-2 text-body-xl">Video Player Preferences</h2>
						<div className="flex items-center gap-2">
							<label htmlFor="minResolution">Minimum Resolution:</label>
							<select
								id="minResolution"
								name="minResolution"
								defaultValue={playerPreferences?.minResolution}
								className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
							>
								<option value="">Auto</option>
								<option value="480">480p</option>
								<option value="720">720p</option>
								<option value="1080">1080p</option>
								<option value="1440">1440p</option>
								<option value="2160">2160p (4K)</option>
							</select>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="maxResolution">Maximum Resolution:</label>
							<select
								id="maxResolution"
								name="maxResolution"
								defaultValue={playerPreferences?.maxResolution}
								className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
							>
								<option value="">Auto</option>
								<option value="720">720p</option>
								<option value="1080">1080p</option>
								<option value="1440">1440p</option>
								<option value="2160">2160p (4K)</option>
							</select>
						</div>
					</div>
					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Font Size Preference</h2>
							<SimpleTooltip content="Defaults to 16px">
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="fontSize">Font Size</label>
							<input
								type="number"
								id="fontSize"
								name="fontSize"
								defaultValue={fontSizePreference ?? 16}
								step="1"
								min="12"
								max="26"
								className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
							/>
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Presence Preference</h2>

							<SimpleTooltip content="This controls whether your name and avatar are displayed in the pile of faces in navigation">
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="optOutPresence"
								name="optOutPresence"
								defaultChecked={presencePreferences?.optOut}
							/>
							<label htmlFor="optOutPresence">
								Opt out of presence features
							</label>
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Persist Playground</h2>

							<SimpleTooltip
								content={`When enabled, clicking "Set to Playground" will save the current playground in the "saved-playgrounds" directory.`}
							>
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="persistPlayground"
								name="persistPlayground"
								defaultChecked={playgroundPreferences?.persist}
							/>
							<label htmlFor="persistPlayground">
								Enable saving playground
							</label>
						</div>
					</div>

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Exercise Directory Warning</h2>

							<SimpleTooltip
								content={`When enabled, you'll see a warning banner when you have changes in the exercises directory. This helps remind you to work in the playground directory instead.`}
							>
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="dismissExerciseWarning"
								name="dismissExerciseWarning"
								defaultChecked={exerciseWarningPreferences?.dismissed}
							/>
							<label htmlFor="dismissExerciseWarning">
								Dismiss exercise directory warnings
							</label>
						</div>
					</div>

					<div className="h-4" />

					<Button
						varient="primary"
						type="submit"
						name="intent"
						value="update-preferences"
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Updating...' : 'Update Preferences'}
					</Button>
				</Form>
			</main>
		</div>
	)
}
