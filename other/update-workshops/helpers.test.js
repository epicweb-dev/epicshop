import assert from 'node:assert/strict'
import {
	canUpdateWorkflowFiles,
	isWorkflowScopeError,
	parseOAuthScopes,
	partitionFilesByWorkflow,
	workflowScopeHint,
} from './helpers.js'

assert.equal(parseOAuthScopes(null), null)
assert.equal(parseOAuthScopes(undefined), null)

assert.deepEqual(parseOAuthScopes('repo, workflow, read:org'), [
	'repo',
	'workflow',
	'read:org',
])
assert.deepEqual(parseOAuthScopes(''), [])

// classic PAT without workflow scope cannot update workflow files (aha)
assert.equal(canUpdateWorkflowFiles(['repo']), false)
assert.equal(canUpdateWorkflowFiles(['repo', 'workflow']), true)

assert.equal(canUpdateWorkflowFiles(null), true)
assert.equal(canUpdateWorkflowFiles([]), true)

// detects GitHub workflow-scope push rejection (aha)
assert.equal(
	isWorkflowScopeError({
		message: 'Command failed with exit code 1: git push',
		stderr:
			' ! [remote rejected] main -> main (refusing to allow a Personal Access Token to create or update workflow `.github/workflows/validate.yml` without `workflow` scope)',
	}),
	true,
)
assert.equal(isWorkflowScopeError(new Error('Authentication failed')), false)

assert.deepEqual(
	partitionFilesByWorkflow([
		'package.json',
		'.github/workflows/validate.yml',
		'epicshop/fly.yaml',
	]),
	{
		nonWorkflowFiles: ['package.json', 'epicshop/fly.yaml'],
		workflowFiles: ['.github/workflows/validate.yml'],
	},
)

assert.match(workflowScopeHint(), /workflow/)
assert.match(workflowScopeHint(), /WORKSHOP_UPDATE_TOKEN/)

console.log('helpers.test.js: all assertions passed')
