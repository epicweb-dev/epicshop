export type WarmResult = {
	success: boolean
	message?: string
	error?: Error
}

/**
 * Warm up the workshop application caches (apps, diffs)
 */
export async function warm(): Promise<WarmResult> {
	try {
		const { getApps, isProblemApp, isSolutionApp } = await import(
			'@epic-web/workshop-utils/apps.server'
		)
		const { getDiffOutputWithRelativePaths, getDiffFiles } = await import(
			'@epic-web/workshop-utils/diff.server'
		)

		// Warm up the apps cache
		const apps = await getApps()

		// Get problem/solution pairs and generate diffs to warm the diff cache
		const problemApps = apps.filter(isProblemApp)
		const solutionApps = apps.filter(isSolutionApp)

		let diffCount = 0

		for (const problemApp of problemApps) {
			// Find the corresponding solution app
			const solutionApp = solutionApps.find(
				(sol: any) =>
					sol.exerciseNumber === problemApp.exerciseNumber &&
					sol.stepNumber === problemApp.stepNumber,
			)

			if (solutionApp) {
				try {
					await getDiffOutputWithRelativePaths(problemApp, solutionApp)
					await getDiffFiles(problemApp, solutionApp)
					diffCount++
				} catch (error) {
					// Continue with other diffs even if one fails
					console.error(
						`Failed to generate diff for exercise ${problemApp.exerciseNumber}.${problemApp.stepNumber}:`,
						error instanceof Error ? error.message : String(error),
					)
				}
			}
		}

		return {
			success: true,
			message: `Cache warming complete! Loaded ${apps.length} apps and generated ${diffCount} diffs.`,
		}
	} catch (error) {
		return {
			success: false,
			message: 'Error warming caches',
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}