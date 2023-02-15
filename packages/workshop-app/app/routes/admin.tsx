import type { DataFunctionArgs } from '@remix-run/node'
import fs from 'fs'
import { json } from '@remix-run/node'
import { Form, useLoaderData, useNavigation } from '@remix-run/react'
import { getDiffFiles } from '~/utils/diff.server'
import {
	getApps,
	getNextExerciseApp,
	getReadmePath,
	isProblemApp,
} from '~/utils/apps.server'
import { getProcesses } from '~/utils/process-manager.server'
import { updateFilesSection } from '~/utils/readme-files-section.server'

export async function loader() {
	const apps = (await getApps()).filter(
		(a, i, ar) => ar.findIndex(b => a.name === b.name) === i,
	)
	const processes: Record<
		string,
		{ port: number; pid?: number; color: string }
	> = {}
	const testProcesses: Record<
		string,
		{ pid?: number; exitCode?: number | null }
	> = {}
	for (const [
		name,
		{ port, process, color },
	] of getProcesses().devProcesses.entries()) {
		processes[name] = { port, pid: process.pid, color }
	}

	for (const [
		name,
		{ process, exitCode },
	] of getProcesses().testProcesses.entries()) {
		testProcesses[name] = { pid: process?.pid, exitCode }
	}
	return json({
		apps,
		processes,
		testProcesses,
	})
}

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case 'set-files': {
			const apps = (await getApps()).filter(isProblemApp)
			for (const app of apps) {
				const nextApp = await getNextExerciseApp(app)
				const app1 =
					app.stepNumber > 1
						? apps.find(
								a => a.name === app.name && a.stepNumber === app.stepNumber - 1,
						  ) ?? app
						: app
				const files = nextApp ? await getDiffFiles(app1, nextApp) : []
				const readmePath = await getReadmePath({
					appDir: app.fullPath,
					stepNumber: isProblemApp(app) ? app.stepNumber : undefined,
				})
				const readme = await fs.promises.readFile(readmePath, 'utf-8')
				const updatedReadme = await updateFilesSection(
					readme,
					files,
					app.fullPath,
				)
				if (readme !== updatedReadme) {
					await fs.promises.writeFile(readmePath, updatedReadme)
				}
			}
			return json({ success: true })
		}
		default: {
			throw new Error(`Unknown intent: ${intent}`)
		}
	}
}

export default function AdminLayout() {
	const data = useLoaderData<typeof loader>()
	const navigation = useNavigation()

	const isSettingFiles = navigation.formData?.get('intent') === 'set-files'

	return (
		<div className="container mx-auto">
			<h1>Admin</h1>
			<div>
				<h2>Commands</h2>
				<ul className="max-h-48 overflow-y-scroll border-2 p-8">
					<li>
						<Form method="post">
							<button name="intent" value="set-files">
								{isSettingFiles ? 'Setting Files...' : 'Set Files'}
							</button>
						</Form>
					</li>
				</ul>
			</div>
			<div>
				<h2>Apps</h2>
				<ul className="max-h-48 overflow-y-scroll border-2 p-8">
					{data.apps.map(app => (
						<li key={app.id}>
							{data.processes[app.name] ? (
								<Pinger status="running" />
							) : (
								<Pinger status="stopped" />
							)}
							{app.name}
						</li>
					))}
				</ul>
			</div>
			<div>
				<h2>Processes</h2>
				<ul className="overflow-y-scroll border-2 p-8">
					{Object.entries(data.processes).map(([key, process]) => (
						<li key={key}>
							<span>
								{key} - Port: {process.port} - PID {process.pid} -{' '}
								{process.color}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div>
				<h2>Test Processes</h2>
				<ul className="overflow-y-scroll border-2 p-8">
					{Object.entries(data.testProcesses).map(([key, process]) => (
						<li key={key}>
							<span>
								{key} - PID {process.pid} - Exit code: {process.exitCode}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

function Pinger({
	status,
}: {
	status: 'running' | 'starting' | 'stopped' | 'taken'
}) {
	const colors = {
		running: {
			pinger: 'bg-green-400',
			circle: 'bg-green-500',
		},
		starting: {
			pinger: 'bg-sky-400',
			circle: 'bg-sky-500',
		},
		stopped: {
			circle: 'bg-gray-500',
		},
		taken: {
			pinger: 'bg-red-400',
			circle: 'bg-red-500',
		},
	}[status]
	return (
		<span className="relative flex h-3 w-3">
			{colors.pinger ? (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colors.pinger} opacity-75`}
				/>
			) : null}
			<span
				className={`relative inline-flex h-3 w-3 rounded-full ${colors.circle}`}
			/>
		</span>
	)
}
