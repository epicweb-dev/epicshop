import { getApps, isProblemApp, typedBoolean } from './apps.server.ts'
import { test, expect } from '@playwright/test'
import z from 'zod'
import crossSpawn from 'cross-spawn'

export async function getInBrowserTestPages() {
	const apps = (await getApps())
		.filter(a => !isProblemApp(a))
		.filter(a => a.test.type === 'browser')
	const pages = apps.map(app => {
		if (app.test.type !== 'browser') return null
		const { baseUrl } = app.test
		return app.test.testFiles.map(testFile => {
			return {
				path: `${baseUrl}${testFile}`,
				testFile,
			}
		})
	})
	return pages.filter(typedBoolean).flat()
}

const sleep = (time: number) =>
	new Promise(resolve => setTimeout(resolve, time))

async function waitFor<ReturnValue>(
	cb: () => ReturnValue | Promise<ReturnValue>,
	{ timeout = 1000, interval = 30 } = {},
) {
	const timeEnd = Date.now() + timeout
	let lastError: unknown | null = null
	while (Date.now() < timeEnd) {
		try {
			const result = await cb()
			if (result) return result
		} catch (error) {
			lastError = error
		}
		await sleep(interval)
	}
	throw lastError || new Error(`waitFor timed out after ${timeout}ms`)
}

export function setupInBrowserTests() {
	// doing this because playwright needs the tests to be registered synchoronously
	const code = `require('@kentcdodds/workshop-app/playwright').getInBrowserTestPages().then(r => console.log(JSON.stringify(r)))`
	const result = crossSpawn.sync('node', ['--eval', code], {
		encoding: 'utf-8',
	})
	if (result.status !== 0) {
		console.error(result.output.join('\n'))
		throw new Error(
			`Failed to get in-browser test pages. Status: ${result.status}.`,
		)
	}
	const testPages = z
		.array(z.object({ path: z.string() }))
		.parse(JSON.parse(result.stdout))

	for (const testPage of testPages) {
		// eslint-disable-next-line no-loop-func
		test(testPage.path, async ({ page }) => {
			const errors: Array<string> = []
			const logs: Array<string> = []
			const infos: Array<string> = []
			page.on('console', message => {
				switch (message.type()) {
					case 'error': {
						errors.push(message.text())
						break
					}
					case 'log': {
						logs.push(message.text())
						break
					}
					case 'info': {
						infos.push(message.text())
						break
					}
				}
			})
			await page.goto(testPage.path)
			await page.waitForLoadState()
			await waitFor(
				() => infos.find(info => info.includes('status: pending')),
				{ timeout: 10_000 },
			)
			const result = await Promise.race([
				waitFor(() => logs.find(log => log.includes('status: pass')), {
					timeout: 10_000,
				}),
				waitFor(() => (errors.length > 0 ? errors : null), {
					timeout: 10_000,
				}).then(errors => {
					throw errors
				}),
			])
			expect(result).toContain('status: pass')
		})
	}
}
