import {
	getPreferences,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import { Form, useLoaderData, useNavigation } from 'react-router'
import { Button } from '#app/components/button.tsx'
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
	const dismissed = formData.get('dismissWarning') === 'on'

	await setPreferences({
		exerciseWarning: { dismissed },
	})

	return redirectWithToast('/workspace-structure', {
		title: 'Preferences updated',
		description:
			'Your workspace structure warning preference has been updated.',
		type: 'success',
	})
}

export default function WorkspaceStructure() {
	const { preferences } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	return (
		<div className="h-full w-full overflow-y-auto">
			<main className="container mt-12 flex w-full max-w-4xl grow flex-col gap-6 pb-24">
				<h1 className="text-h1">Workshop Structure & Guidelines</h1>

				<div className="border-destructive bg-destructive/10 rounded-lg border p-4">
					<h2 className="text-destructive mb-2 text-lg font-semibold">
						⚠️ Important: Work in the Right Directory
					</h2>
					<p className="text-destructive text-sm">
						<strong>
							Always work in the `playground` directory, not the `exercises`
							directory.
						</strong>
					</p>
					<p className="text-destructive mt-2 text-sm">
						To <strong>make this warning go away</strong>, either:
						<ol className="list-decimal pl-4">
							<li>
								{`Undo your changes in the exercises directory with: `}
								<code className="bg-background rounded px-1 py-0.5 text-xs">
									git checkout exercises/
								</code>
							</li>
							<li>
								Read below and check the box once you understand how this is
								supposed to work.
							</li>
						</ol>
					</p>
				</div>

				<div className="space-y-6">
					<section>
						<h2 className="text-h2 mb-3">Directory Structure</h2>
						<div className="space-y-4">
							<div className="border-border bg-muted rounded-lg border p-4">
								<h3 className="mb-2 text-lg font-semibold">📁 exercises/</h3>
								<p className="text-muted-foreground text-sm">
									<strong>Templates only.</strong> These are the original
									exercise files that serve as the starting point for each step.
									<strong className="text-destructive">
										{' '}
										Do not edit these files
									</strong>{' '}
									unless you're contributing to the workshop or are the
									instructor building the content.
								</p>
							</div>

							<div className="border-border bg-muted rounded-lg border p-4">
								<h3 className="mb-2 text-lg font-semibold">🏗️ playground/</h3>
								<p className="text-muted-foreground text-sm">
									<strong>Your workspace.</strong> This is where you practice
									and develop your skills.
									<strong className="text-primary"> Always work here</strong> to
									complete exercises and experiment with the code.
								</p>
							</div>
						</div>
					</section>

					<section>
						<h2 className="text-h2 mb-3">Workshop UI Tabs</h2>
						<div className="space-y-4">
							<div className="border-border bg-muted rounded-lg border p-4">
								<h3 className="mb-2 text-lg font-semibold">
									🏗️ Playground Tab
								</h3>
								<p className="text-muted-foreground text-sm">
									Shows the <strong>current state of your playground</strong> -
									this is your work in progress.
								</p>
							</div>

							<div className="border-border bg-muted rounded-lg border p-4">
								<h3 className="mb-2 text-lg font-semibold">📋 Problem Tab</h3>
								<p className="text-muted-foreground text-sm">
									Shows the <strong>current state of the problem</strong> -
									useful for referencing where you started in this exercise
									step.
								</p>
							</div>

							<div className="border-border bg-muted rounded-lg border p-4">
								<h3 className="mb-2 text-lg font-semibold">✅ Solution Tab</h3>
								<p className="text-muted-foreground text-sm">
									Shows the <strong>current state of the solution</strong> -
									useful for checking how things should work when you're
									finished and comparing to your own solution.
								</p>
							</div>
						</div>
					</section>

					<section>
						<h2 className="text-h2 mb-3">Exceptions to the Rule</h2>
						<div className="border-border bg-muted rounded-lg border p-4">
							<p className="text-muted-foreground text-sm">
								The only times you should modify files in the{' '}
								<code className="bg-background rounded px-1 py-0.5 text-xs">
									exercises/
								</code>{' '}
								directory are:
							</p>
							<ul className="text-muted-foreground mt-2 space-y-1 text-sm">
								<li>
									• <strong>You're the instructor</strong> building or
									maintaining the workshop content
								</li>
								<li>
									• <strong>You're contributing</strong> to the workshop source
									code (bug fixes, improvements, etc.)
								</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="text-h2 mb-3">Need a Refresher?</h2>
						<p className="text-muted-foreground text-sm">
							For a complete overview of the typical workflow, review the
							introductory material for this workshop.
						</p>
					</section>

					<hr />

					<section>
						<div className="border-destructive bg-destructive/10 rounded-lg border p-4">
							<h2 className="text-destructive mb-2 text-lg font-semibold">
								Make this warning go away
							</h2>
							<Form method="post" className="space-y-4">
								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										id="dismissWarning"
										name="dismissWarning"
										defaultChecked={preferences?.exerciseWarning?.dismissed}
										className="border-border rounded"
									/>
									<label htmlFor="dismissWarning" className="text-sm">
										I understand this and do not need further warnings about
										editing the exercises directory
									</label>
								</div>

								<Button type="submit" varient="primary" disabled={isSubmitting}>
									{isSubmitting ? 'Saving...' : 'Save Preference'}
								</Button>
							</Form>
						</div>
					</section>
				</div>
			</main>
		</div>
	)
}
