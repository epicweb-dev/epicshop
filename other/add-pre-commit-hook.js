import { execa } from 'execa'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const hookMarker = 'epicshop-pre-commit-format'
const hookContents = `#!/usr/bin/env bash
# ${hookMarker}
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [ "\${#files[@]}" -eq 0 ]; then
  exit 0
fi

prettier_bin="./node_modules/.bin/prettier"
if [ ! -x "$prettier_bin" ]; then
  echo "pre-commit: prettier not installed, skipping formatting." >&2
  exit 0
fi

"$prettier_bin" --write --ignore-unknown "\${files[@]}"
git add "\${files[@]}"
`

const installHook = async () => {
	const { stdout: gitRoot } = await execa('git', [
		'rev-parse',
		'--show-toplevel',
	])
	const { stdout: gitDir } = await execa('git', ['rev-parse', '--git-dir'], {
		cwd: gitRoot,
	})
	const hooksDir = path.resolve(gitRoot, gitDir, 'hooks')
	const wrapperPath = path.join(hooksDir, 'pre-commit')

	await mkdir(hooksDir, { recursive: true })

	// Cursor installs a wrapper hook with an "@cursor-managed" marker, so chain
	// our hook instead of overwriting the wrapper when it's detected.
	const wrapperContents = await readFile(wrapperPath, 'utf8').catch(() => null)
	const isCursorManaged = wrapperContents?.includes('@cursor-managed')

	if (isCursorManaged) {
		// If already chained, skip
		if (wrapperContents.includes(hookMarker)) {
			return
		}
		// Chain our hook by appending it to Cursor's wrapper
		const chainedContents = wrapperContents + '\n' + hookContents
		await writeFile(wrapperPath, chainedContents, 'utf8')
		await chmod(wrapperPath, 0o755)
		console.log(
			`Chained pre-commit hook into Cursor's wrapper at ${wrapperPath}`,
		)
	} else {
		// No Cursor wrapper, install our hook normally
		const existing = await readFile(wrapperPath, 'utf8').catch(() => null)
		if (existing && !existing.includes(hookMarker)) {
			return
		}
		await writeFile(wrapperPath, hookContents, 'utf8')
		await chmod(wrapperPath, 0o755)
		console.log(`Installed pre-commit hook at ${wrapperPath}`)
	}
}

installHook().catch((error) => {
	console.warn(
		`Unable to install pre-commit hook; continuing without it.\n${error}`,
	)
})
