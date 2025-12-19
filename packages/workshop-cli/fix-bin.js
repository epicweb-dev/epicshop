#!/usr/bin/env node

// I really should open an issue on zshy to make this configurable or something
// but I want cli.js to be the bin, not the dist/cli.js file...

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const packageJsonPath = join(__dirname, 'package.json')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
packageJson.bin = './cli.js'

writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
