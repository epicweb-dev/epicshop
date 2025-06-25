#!/usr/bin/env node

import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import getPort from 'get-port'
import open from 'open'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))
const argv = process.argv.slice(2)

const command = argv[0]

switch (command) {
	case 'start': {
		start()
		break
	}
	case 'upgrade':
	case 'update': {
		const { updateLocalRepo } = await import(
			'@epic-web/workshop-utils/git.server'
		)
		const result = await updateLocalRepo()
		if (result.status === 'success') {
			console.log(`✅ ${result.message}`)
		} else {
			console.error(`❌ ${result.message}`)
		}
		break
	}
	default: {
		throw new Error(`Command ${command} is not supported`)
	}
}

async function start() {
	const appDir = path.join(__dirname, '..')
	const isProd = process.env.NODE_ENV === 'production' || isPublished
	const isDeployed =
		process.env.EPICSHOP_DEPLOYED === 'true' ||
		process.env.EPICSHOP_DEPLOYED === '1'

	const parentPort = await getPort({ port: 3742 })
	const parentToken = crypto.randomBytes(32).toString('hex')

	const childCommand = isProd ? 'node ./start.js' : 'npm run dev'
	const childEnv = {
		...process.env,
		EPICSHOP_CONTEXT_CWD: process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd(),
		EPICSHOP_PARENT_PORT: String(parentPort),
		EPICSHOP_PARENT_TOKEN: parentToken,
	}
	if (isProd) childEnv.NODE_ENV = 'production'

	let server = null
	let child = null
	let restarting = false
	let childPort = null
	let childPortPromiseResolve = null
	const childPortPromise = new Promise((resolve) => {
		childPortPromiseResolve = resolve
	}).then((port) => {
		childPort = port
		return port
	})

	function parsePortFromLine(line) {
		const match = line.match(/localhost:(\d+)/)
		if (match) {
			return Number(match[1])
		}
		return null
	}

	async function waitForChildReady() {
		const port = await childPortPromise
		const url = `http://localhost:${port}/`
		const maxAttempts = 40 // 20s max (500ms interval)
		for (let i = 0; i < maxAttempts; i++) {
			try {
				const res = await fetch(url, { method: 'GET' })
				if (res.ok) return true
			} catch {}
			await new Promise((r) => setTimeout(r, 500))
		}
		return false
	}

	async function doUpdateAndRestart() {
		console.log('\n👀 Checking for updates...')
		const { updateLocalRepo } = await import(
			'@epic-web/workshop-utils/git.server'
		)
		const result = await updateLocalRepo()
		if (result.status === 'success') {
			console.log(`✅ ${result.message}`)
			console.log('\n🔄 Restarting...')
			restarting = true
			await killChild(child)
			restarting = false
			spawnChild()
			const ready = await waitForChildReady()
			return ready
		} else {
			console.error(`❌ ${result.message}`)
			console.error(
				'Update failed. Please try again or see the repo for manual setup.',
			)
			return false
		}
	}

	if (!isDeployed) {
		server = http.createServer(async (req, res) => {
			try {
				if (req.url === '/__epicshop-restart') {
					const port = await childPort
					res.setHeader(
						'Access-Control-Allow-Origin',
						`http://localhost:${port}`,
					)
					res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
					res.setHeader(
						'Access-Control-Allow-Headers',
						'x-epicshop-token, content-type',
					)
					res.setHeader('Access-Control-Max-Age', '86400')

					// Handle preflight OPTIONS request
					if (req.method === 'OPTIONS') {
						res.statusCode = 204
						res.end()
						return
					}
					if (req.method === 'POST') {
						res.setHeader('Content-Type', 'application/json')
						const token = req.headers['x-epicshop-token']
						if (token !== parentToken) {
							res.statusCode = 403
							res.end(JSON.stringify({ status: 'error', message: 'Forbidden' }))
							return
						}
						console.log(
							'\n🔄 Update requested from web UI. Running update and restarting app process...',
						)
						const ready = await doUpdateAndRestart()
						if (ready) {
							res.statusCode = 200
							res.end(JSON.stringify({ status: 'ok' }))
						} else {
							res.statusCode = 500
							res.end(
								JSON.stringify({
									status: 'error',
									message: 'Restarted but not ready in time',
								}),
							)
						}
						return
					}
				}

				res.statusCode = 404
				res.end(JSON.stringify({ status: 'error', message: 'Not found' }))
				return
			} catch (error) {
				console.error(error)
				res.statusCode = 500
				res.end(
					JSON.stringify({ status: 'error', message: 'Internal server error' }),
				)
				return
			}
		})
		server.listen(parentPort, '127.0.0.1')
	}

	function spawnChild() {
		child = spawn(childCommand, {
			shell: true,
			cwd: appDir,
			// Parent handles stdin, child gets no stdin; capture stdout for parsing and piping
			stdio: ['pipe', 'pipe', 'inherit'],
			env: childEnv,
		})
		if (child.stdout) {
			child.stdout.on('data', (data) => {
				process.stdout.write(data)
				if (!childPort) {
					const str = data.toString('utf8')
					const lines = str.split(/\r?\n/)
					for (const line of lines) {
						const port = parsePortFromLine(line)
						if (port) {
							childPortPromiseResolve?.(port)
						}
					}
				}
			})
		}
		child.on('exit', async (code) => {
			if (restarting) {
				restarting = false
			} else {
				if (server) await new Promise((resolve) => server.close(resolve))
				process.exit(code ?? 0)
			}
		})
	}

	console.log(
		`🐨 Welcome to the workshop, ${chalk.bold.italic(os.userInfo().username)}!`,
	)

	spawnChild()

	if (process.stdin.isTTY && !isDeployed) {
		printSupportedKeys()
		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.setEncoding('utf8')
		process.stdin.on('data', async (key) => {
			if (key === 'u') {
				console.log(
					'\n🔄 Update requested from terminal. Running update and restarting app process...',
				)
				await doUpdateAndRestart()
			} else if (key === 'o') {
				if (childPort) {
					console.log(
						chalk.blue(
							`\n🌐 Opening browser to http://localhost:${childPort} ...`,
						),
					)
					await open(`http://localhost:${childPort}`)
				} else {
					console.log(chalk.red('Local server URL not available yet.'))
				}
			} else if (key === 'q') {
				console.log(chalk.yellow('\n👋 Exiting...'))
				await cleanupBeforeExit()
				process.exit(0)
			} else if (key === 'r') {
				console.log(chalk.magenta('\n🔄 Restarting app process...'))
				restarting = true
				await killChild(child)
				restarting = false
				spawnChild()
			} else if (key === 'k') {
				const messages = [
					chalk.bgCyan.black('🐨 Kody says: You are koalafied for greatness!'),
					chalk.bgGreen.black('🐨 Kody says: Keep going, you are pawsome!'),
					chalk.bgMagenta.white('🐨 Kody says: Eucalyptus up and code on!'),
					chalk.bgYellow.black('🐨 Kody says: You can do it, fur real!'),
					chalk.bgBlue.white('🐨 Kody says: Stay curious, stay cuddly!'),
					chalk.bgRed.white("🐨 Kody says: Don't leaf your dreams behind!"),
				]
				const msg = messages[Math.floor(Math.random() * messages.length)]
				console.log('\n' + msg + '\n')
			} else if (key === '\u0003') {
				// Ctrl+C
				await cleanupBeforeExit()
				process.exit(0)
			}
		})
	}

	async function cleanupBeforeExit() {
		if (process.platform === 'win32' && child && child.pid) {
			spawn('taskkill', ['/pid', child.pid, '/f', '/t'])
		}
		await killChild(child)
		if (server) await new Promise((resolve) => server.close(resolve))
	}

	closeWithGrace(cleanupBeforeExit)
}

async function killChild(child) {
	if (!child) return
	return new Promise((resolve) => {
		const onExit = () => resolve()
		child.once('exit', onExit)
		child.kill()
	})
}

function printSupportedKeys() {
	console.log(chalk.bold.cyan('\nSupported keys:'))
	console.log(`  ${chalk.blue('o')} - open browser`)
	console.log(`  ${chalk.green('u')} - update repo`)
	console.log(`  ${chalk.magenta('r')} - restart`)
	console.log(`  ${chalk.cyan('k')} - Kody kudos 🐨`)
	console.log(`  ${chalk.gray('q')} (or ${chalk.gray('Ctrl+C')}) - exit`)
}
