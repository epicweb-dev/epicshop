import '@epic-web/workshop-utils/init-env'

export type UpdateResult = {
	success: boolean
	message?: string
	error?: Error
}

/**
 * Update the workshop to the latest version
 */
export async function update({
	silent = false,
}: { silent?: boolean } = {}): Promise<UpdateResult> {
	const isDeployed =
		process.env.EPICSHOP_DEPLOYED === 'true' ||
		process.env.EPICSHOP_DEPLOYED === '1'

	if (isDeployed) {
		return {
			success: false,
			message: 'Updates are not available in deployed environments.',
		}
	}

	try {
		const { updateLocalRepo } =
			await import('@epic-web/workshop-utils/git.server')
		const result = await updateLocalRepo()
		if (result.status === 'success') {
			if (!silent) {
				console.log(`✅ ${result.message}`)
			}
			return {
				success: true,
				message: result.message,
			}
		} else {
			if (!silent) {
				console.error(`❌ ${result.message}`)
			}
			return {
				success: false,
				message: result.message,
			}
		}
	} catch (error) {
		if (!silent) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`❌ ${message}`)
		}
		return {
			success: false,
			message: 'Update functionality not available',
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}
