import { ExpectedMcpError } from './sentry-filters.ts'

/**
 * Detects literal shell placeholders that an MCP client failed to expand
 * (e.g. "$1", "${2}", "$WORKSHOP_DIR" as a path segment).
 */
const unexpandedShellVariablePattern =
	/(?:^|[/\\])(\$\{?[0-9]+\}?|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)(?=$|[/\\])/

export function findUnexpandedShellVariable(value: string): string | null {
	const match = value.match(unexpandedShellVariablePattern)
	return match?.[1] ?? null
}

export function unexpandedShellVariableErrorMessage(
	argName: string,
	value: string,
	token: string,
) {
	return (
		`Received what looks like an unexpanded shell variable (${JSON.stringify(token)}) ` +
		`for ${argName} (value: ${JSON.stringify(value)}). ` +
		`This usually means your MCP server config has a literal ${JSON.stringify(token)} in args that the client never substituted. ` +
		`Replace it with a real value` +
		(argName === 'workshopDirectory'
			? ' (an absolute path to the workshop root)'
			: '') +
		` instead of a shell placeholder.`
	)
}

export function assertNoUnexpandedShellVariable(
	argName: string,
	value: string,
) {
	const token = findUnexpandedShellVariable(value)
	if (!token) return
	throw new ExpectedMcpError(
		unexpandedShellVariableErrorMessage(argName, value, token),
	)
}
