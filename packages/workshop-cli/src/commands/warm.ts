import '@epic-web/workshop-utils/init-env'

import chalk from 'chalk'

export type WarmResult = {
	success: boolean
	message?: string
	error?: Error
}

/**
 * Warm up the workshop application caches (apps, diffs)
 */
export async function warm({
	silent = false,
}: {
	silent?: boolean
} = {}): Promise<WarmResult> {
	if (!silent) {
		console.log(chalk.blue('🔥 Warming up caches...'))
	}

	try {
		const { getApps, isProblemApp, isSolutionApp } =
			await import('@epic-web/workshop-utils/apps.server')
		const { getDiffFiles, getDiffCode } =
			await import('@epic-web/workshop-utils/diff.server')
		const { warmCache: warmEpicAPICache } =
			await import('@epic-web/workshop-utils/epic-api.server')

		void warmEpicAPICache().catch(() => {}) // ignore failure

		// Warm up the apps cache
		if (!silent) {
			console.log(chalk.yellow('📱 Loading apps...'))
		}
		const apps = await getApps()
		if (!silent) {
			console.log(chalk.green(`✅ Loaded ${apps.length} apps`))
		}

		// Get problem/solution pairs and generate diffs to warm the diff cache
		const problemApps = apps.filter(isProblemApp)
		const solutionApps = apps.filter(isSolutionApp)

		if (!silent) {
			console.log(
				chalk.yellow(
					'🔄 Generating diffs and diff files for problem/solution pairs...',
				),
			)
		}

		let diffCount = 0

		for (const problemApp of problemApps) {
			// Find the corresponding solution app
			const solutionApp = solutionApps.find(
				(sol: any) =>
					sol.exerciseNumber === problemApp.exerciseNumber &&
					sol.stepNumber === problemApp.stepNumber,
			)

			if (solutionApp) {
				const pairName = `${problemApp.exerciseNumber.toString().padStart(2, '0')}.${problemApp.stepNumber.toString().padStart(2, '0')}.problem vs ${solutionApp.exerciseNumber.toString().padStart(2, '0')}.${solutionApp.stepNumber.toString().padStart(2, '0')}.solution`

				try {
					await getDiffCode(problemApp, solutionApp)
					await getDiffFiles(problemApp, solutionApp)
					diffCount++
					if (!silent) {
						console.log(chalk.gray(`  ✓ ${pairName}`))
					}
				} catch (error) {
					if (!silent) {
						console.error(
							chalk.red(`  ❌ ${pairName}:`),
							error instanceof Error ? error.message : String(error),
						)
					}
				}
			}
		}

		if (!silent) {
			console.log(chalk.green(`✅ Generated ${diffCount} diffs and diff files`))
			console.log(chalk.green('🔥 Cache warming complete!'))
		}

		return {
			success: true,
			message: `Cache warming complete! Loaded ${apps.length} apps and generated ${diffCount} diffs.`,
		}
	} catch (error) {
		const errorMessage = 'Error warming caches'
		if (!silent) {
			console.error(chalk.red(`❌ ${errorMessage}:`), error)
		}
		return {
			success: false,
			message: errorMessage,
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}
