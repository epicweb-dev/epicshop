#!/usr/bin/env node
import { execa } from 'execa'

const args = process.argv.slice(2)

async function runNx(extraArgs = []) {
	const subprocess = execa('npx', ['nx', ...args, ...extraArgs], {
		stdio: ['inherit', 'pipe', 'pipe'],
		all: true,
	})

	if (subprocess.stdout) subprocess.stdout.pipe(process.stdout)
	if (subprocess.stderr) subprocess.stderr.pipe(process.stderr)

	let output = ''
	if (subprocess.all) {
		subprocess.all.on('data', (chunk) => {
			output += chunk.toString()
		})
	}

	try {
		await subprocess
		return { success: true, output }
	} catch {
		return { success: false, output }
	}
}

const main = async () => {
	const { success, output } = await runNx()
	if (success) return

	if (/nx cloud/i.test(output)) {
		console.log('\x1b[33mNx Cloud failed, retrying without cloud...\x1b[0m')
		const { success: retrySuccess } = await runNx(['--no-cloud'])
		if (!retrySuccess) {
			console.error('\x1b[31mNx failed even after disabling cloud.\x1b[0m')
			process.exit(1)
		}
	} else {
		console.error('\x1b[31mNx failed.\x1b[0m')
		process.exit(1)
	}
}

main()
