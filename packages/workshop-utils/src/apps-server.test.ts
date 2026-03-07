import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'

const originalContext = process.env.EPICSHOP_CONTEXT_CWD

async function createTempWorkshop() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'epicshop-playground-'))
	await fs.writeFile(
		path.join(root, 'package.json'),
		JSON.stringify(
			{
				name: 'epicshop-playground-test',
				epicshop: {
					title: 'Playground Test',
					githubRepo: 'https://github.com/example/workshop',
				},
			},
			null,
			2,
		),
	)
	await fs.mkdir(path.join(root, 'playground'), { recursive: true })
	const cacheDir = path.join(root, 'node_modules', '.cache', 'epicshop')
	await fs.mkdir(cacheDir, { recursive: true })
	await fs.writeFile(
		path.join(cacheDir, 'playground.json'),
		JSON.stringify({ appName: '05.02.problem' }, null, 2),
	)

	return {
		root,
		async [Symbol.asyncDispose]() {
			await fs.rm(root, { recursive: true, force: true })
		},
	}
}

afterEach(() => {
	if (originalContext) {
		process.env.EPICSHOP_CONTEXT_CWD = originalContext
	} else {
		delete process.env.EPICSHOP_CONTEXT_CWD
	}
})

test('returns playground info when base app is missing', async () => {
	await using workshop = await createTempWorkshop()

	process.env.EPICSHOP_CONTEXT_CWD = workshop.root
	;(
		globalThis as { __epicshop_apps_initialized__?: boolean }
	).__epicshop_apps_initialized__ = false
	vi.resetModules()

	const { getPlaygroundApp, setWorkshopRoot } = await import('./apps.server.ts')
	setWorkshopRoot(workshop.root)

	const playgroundApp = await getPlaygroundApp()
	expect(playgroundApp).not.toBeNull()
	expect(playgroundApp?.appName).toBe('05.02.problem')
	expect(playgroundApp?.isUpToDate).toBe(false)
}, 15000)

test('classifies non-index app without package.json as file dev type', async () => {
	await using workshop = await createTempWorkshop()
	const fileExtraDir = path.join(workshop.root, 'extra', '01.files')
	await fs.mkdir(fileExtraDir, { recursive: true })
	await fs.writeFile(
		path.join(fileExtraDir, 'notes.txt'),
		'hello file explorer',
	)

	process.env.EPICSHOP_CONTEXT_CWD = workshop.root
	;(
		globalThis as { __epicshop_apps_initialized__?: boolean }
	).__epicshop_apps_initialized__ = false
	vi.resetModules()

	const { getApps, setWorkshopRoot } = await import('./apps.server.ts')
	setWorkshopRoot(workshop.root)

	const apps = await getApps()
	const fileApp = apps.find((app) => app.fullPath === fileExtraDir)
	expect(fileApp).toBeTruthy()
	expect(fileApp?.dev.type).toBe('file')
}, 15000)

test('classifies non-package app with index file as browser dev type', async () => {
	await using workshop = await createTempWorkshop()
	const browserExtraDir = path.join(workshop.root, 'extra', '02.browser')
	await fs.mkdir(browserExtraDir, { recursive: true })
	await fs.writeFile(
		path.join(browserExtraDir, 'index.js'),
		'console.log("browser app")',
	)

	process.env.EPICSHOP_CONTEXT_CWD = workshop.root
	;(
		globalThis as { __epicshop_apps_initialized__?: boolean }
	).__epicshop_apps_initialized__ = false
	vi.resetModules()

	const { getApps, setWorkshopRoot } = await import('./apps.server.ts')
	setWorkshopRoot(workshop.root)

	const apps = await getApps()
	const browserApp = apps.find((app) => app.fullPath === browserExtraDir)
	expect(browserApp).toBeTruthy()
	expect(browserApp?.dev.type).toBe('browser')
}, 15000)
