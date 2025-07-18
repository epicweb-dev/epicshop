export type UpdateResult = {
	success: boolean
	message?: string
	error?: Error
}

/**
 * Update the workshop to the latest version
 */
export async function update(): Promise<UpdateResult> {
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
		const { updateLocalRepo } = await import(
			'@epic-web/workshop-utils/git.server'
		)
		const result = await updateLocalRepo()
		if (result.status === 'success') {
			return {
				success: true,
				message: result.message,
			}
		} else {
			return {
				success: false,
				message: result.message,
			}
		}
	} catch (error) {
		return {
			success: false,
			message: 'Update functionality not available',
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}
