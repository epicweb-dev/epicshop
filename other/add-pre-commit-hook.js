#!/usr/bin/env node
import { execa } from 'execa'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const hookMarker = 'epicshop-pre-commit-format'
const hookContents = `#!/usr/bin/env bash
# ${hookMarker}
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

mapfile -d '' -t files < <(git diff --cached --name-only --diff-filter=ACMR -z)

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
	const { stdout: gitRoot } = await execa('git', ['rev-parse', '--show-toplevel'])
	const { stdout: gitDir } = await execa('git', ['rev-parse', '--git-dir'], {
		cwd: gitRoot,
	})
	const hooksDir = path.resolve(gitRoot, gitDir, 'hooks')
	const hookPath = path.join(hooksDir, 'pre-commit')

	await mkdir(hooksDir, { recursive: true })

	const existing = await readFile(hookPath, 'utf8').catch(() => null)
	if (existing && !existing.includes(hookMarker)) {
		console.warn(
			`pre-commit hook already exists at ${hookPath}; skipping install.`,
		)
		return
	}

	await writeFile(hookPath, hookContents, 'utf8')
	await chmod(hookPath, 0o755)
	console.log(`Installed pre-commit hook at ${hookPath}`)
}

installHook().catch((error) => {
	console.warn(
		`Unable to install pre-commit hook; continuing without it.\n${error}`,
	)
})
