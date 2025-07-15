export function getErrorMessage(error: unknown) {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	console.error('Unable to get error message for error', error)
	return 'Unknown Error'
}

export function handleGitHubRepoAndRoot({
	githubRepo,
	githubRoot,
}: {
	githubRepo?: string
	githubRoot?: string
}) {
	if (githubRepo) {
		githubRepo = githubRepo.replace(/\/$/, '')
		githubRoot = `${githubRepo}/tree/main`
	} else if (githubRoot) {
		githubRepo = githubRoot.replace(/\/(blob|tree)\/.*$/, '')
		githubRoot = `${githubRepo}/tree/main`
	} else {
		throw new Error('Either githubRepo or githubRoot is required')
	}
	return { githubRepo, githubRoot }
}
