#!/usr/bin/env node

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))
const argv = process.argv.slice(2)

if (argv[0] !== 'start') {
	throw new Error('Only `start` is supported currently...')
}

const KCDSHOP_CONTEXT_CWD = process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd()

if (process.env.NODE_ENV === 'production' || isPublished) {
	exec('node ./start.js', {
		KCDSHOP_CONTEXT_CWD,
		NODE_ENV: 'production',
	}).catch(code => {
		console.error('Encountered error running the server, exiting...')
		process.exit(code)
	})
} else {
	exec('npm run dev', {
		KCDSHOP_CONTEXT_CWD,
	}).catch(code => {
		console.error('Encountered error running the dev script, exiting...')
		process.exit(code)
	})
}

async function exec(command, envVars) {
	const child = spawn(command, {
		shell: true,
		cwd: path.join(__dirname, '..'),
		stdio: 'inherit',
		env: {
			...process.env,
			...envVars,
		},
	})
	await new Promise((res, rej) => {
		// Kill app on Windows after CTRL+C
		if (process.platform === 'win32') {
			process.on('SIGINT', () => {
				spawn('taskkill', ['/pid', child.pid, '/f', '/t'])
			})
		}
		// process.on('SIGINT', child.kill)
		child.on('exit', code => {
			if (code === 0) {
				res(code)
			} else {
				rej(code)
			}
		})
	})
}
