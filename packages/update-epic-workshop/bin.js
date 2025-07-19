#!/usr/bin/env node

import { execSync } from 'child_process'

function update() {
	const command = 'npx --yes @epic-web/workshop-cli@latest update'
	execSync(command, { stdio: 'inherit' })
}

update()
