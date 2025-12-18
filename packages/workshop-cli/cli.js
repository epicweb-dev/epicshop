#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Check if we're in development (source file exists) or production (published package)
const cliSource = join(__dirname, 'src', 'cli.ts')
const cliBuilt = join(__dirname, 'dist', 'cli.js')

if (existsSync(cliSource)) {
	// Development: use tsx to run source file directly so changes are picked up
	const parentImports = process.argv
		.filter((arg) => arg.startsWith('--import'))
		.join(' ')
	const args = process.argv
		.slice(2)
		.filter((arg) => !arg.startsWith('--import'))
	const command = `tsx ${parentImports} "${cliSource}" ${args.join(' ')}`
	execSync(command, { stdio: 'inherit', shell: true })
} else {
	// Production: use the built file
	// On Windows, absolute paths like "C:\..." are treated as URL schemes ("c:")
	// by the default ESM loader. Convert the path to a proper file:// URL first.
	await import(pathToFileURL(cliBuilt).href)
}
