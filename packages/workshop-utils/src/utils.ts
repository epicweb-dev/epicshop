import './init-env.js'

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
		githubRoot = `${githubRepo.replace(/\/$/, '')}/tree/main`
	} else if (githubRoot) {
		githubRepo = githubRoot.replace(/\/(blob|tree)\/.*$/, '')
		githubRoot = `${githubRepo}/tree/main`
	} else {
		throw new Error(
			`Either githubRepo or githubRoot is required. Please ensure your epicshop package.json config includes either githubRepo or githubRoot configuration.`,
		)
	}
	return { githubRepo, githubRoot }
}
