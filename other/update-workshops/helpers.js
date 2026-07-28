/**
 * Pure helpers for the workshop updater (kept separate for unit tests).
 */

export const DEPLOY_WORKFLOW_PATH = '.github/workflows/validate.yml'

/**
 * Parse the GitHub `X-OAuth-Scopes` response header.
 * Returns `null` when the header is absent (common for fine-grained PATs).
 */
export function parseOAuthScopes(scopesHeader) {
	if (scopesHeader == null) return null
	return scopesHeader
		.split(',')
		.map((scope) => scope.trim())
		.filter(Boolean)
}

/**
 * Classic PATs advertise scopes via `X-OAuth-Scopes`. When that list is present
 * and non-empty, require the `workflow` scope to push workflow file changes.
 * Unknown / fine-grained tokens return true so we still attempt the sync and
 * recover from a push rejection.
 */
export function canUpdateWorkflowFiles(scopes) {
	if (scopes == null || scopes.length === 0) return true
	return scopes.includes('workflow')
}

export function isWorkflowScopeError(error) {
	const message = [
		error?.stderr,
		error?.stdout,
		error?.message,
		error?.all,
		error,
	]
		.filter(Boolean)
		.map(String)
		.join('\n')

	return (
		message.includes('without `workflow` scope') ||
		message.includes('without workflow scope') ||
		message.includes(
			'refusing to allow a Personal Access Token to create or update workflow',
		)
	)
}

export function partitionFilesByWorkflow(
	files,
	workflowPath = DEPLOY_WORKFLOW_PATH,
) {
	const nonWorkflowFiles = []
	const workflowFiles = []
	for (const file of files) {
		if (file === workflowPath) workflowFiles.push(file)
		else nonWorkflowFiles.push(file)
	}
	return { nonWorkflowFiles, workflowFiles }
}

export function workflowScopeHint() {
	return (
		'Add the `workflow` scope to WORKSHOP_UPDATE_TOKEN (classic PAT), or grant ' +
		'Workflows: Read and write on a fine-grained PAT, then re-run Update Workshops.'
	)
}
