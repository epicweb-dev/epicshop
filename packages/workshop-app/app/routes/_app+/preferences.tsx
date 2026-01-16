import {
	getPreferences,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import { Form, useNavigation } from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { useRootLoaderData } from '#app/utils/root-loader.ts'
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
	const dismissOnboardingHint = formData.get('dismissOnboardingHint') === 'on'

	await setPreferences({
		player: {
			minResolution: minResolution ? Number(minResolution) : undefined,
			maxResolution: maxResolution ? Number(maxResolution) : undefined,
		},
		fontSize: fontSize ? Number(fontSize) : undefined,
		presence: { optOut: optOutPresence },
		playground: { persist: persistPlayground },
		exerciseWarning: { dismissed: dismissExerciseWarning },
		onboardingHint: { dismissed: dismissOnboardingHint },
	})

	return redirectWithToast('/preferences', {
		title: 'Preferences updated',
		description: 'Your preferences have been updated.',
		type: 'success',
	})
}

export default function AccountSettings() {
	const rootData = useRootLoaderData()
	const playerPreferences = rootData.preferences?.player
	const fontSizePreference = rootData.preferences?.fontSize
	const presencePreferences = rootData.preferences?.presence
	const playgroundPreferences = rootData.preferences?.playground
	const exerciseWarningPreferences = rootData.preferences?.exerciseWarning
	const onboardingHintPreferences = rootData.preferences?.onboardingHint
	const navigation = useNavigation()

	const isSubmitting = navigation.state === 'submitting'

	return (
		<div className="h-full w-full overflow-y-auto">
			<main className="container mt-12 flex w-full max-w-3xl grow flex-col gap-4 pb-24">
				<h1 className="text-h1 mb-4">Preferences</h1>
				<Form method="post" className="flex w-full max-w-sm flex-col gap-4">
					<div>
						<h2 className="text-body-xl mb-2">Video Player Preferences</h2>
						<div className="flex items-center gap-2">
							<label htmlFor="minResolution">Minimum Resolution:</label>
							<select
								id="minResolution"
								name="minResolution"
								defaultValue={playerPreferences?.minResolution}
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
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
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
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
								className="border-border bg-background text-foreground rounded-md border px-2 py-1"
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

					<div>
						<div className="mb-2 flex items-center gap-2">
							<h2 className="text-body-xl">Onboarding Hint</h2>

							<SimpleTooltip
								content={`The onboarding hint appears at the top of the home page to help new users find the intro instructions.`}
							>
								<Icon name="Question" tabIndex={0} />
							</SimpleTooltip>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="dismissOnboardingHint"
								name="dismissOnboardingHint"
								defaultChecked={onboardingHintPreferences?.dismissed}
							/>
							<label htmlFor="dismissOnboardingHint">
								Dismiss onboarding hint
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
