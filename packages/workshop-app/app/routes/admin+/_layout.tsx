import { getApps } from '@epic-web/workshop-utils/apps.server'
import { getProcesses } from '@epic-web/workshop-utils/process-manager.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { type loader as rootLoader } from '#app/root.tsx'
import {
	useEpicProgress,
	type SerializedProgress,
} from '#app/routes/progress.tsx'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import {
	clearCaches,
	clearData,
	startInspector,
	stopInspector,
} from './admin-utils.server.tsx'

declare global {
	var __inspector_open__: boolean | undefined
}

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	matches,
}) => {
	const rootData = matches.find((m) => m.id === 'root')?.data
	return [{ title: `👷 | ${rootData?.workshopTitle}` }]
}

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	const timings = makeTimings('adminLoader')
	const apps = (await getApps({ request, timings })).filter(
		(a, i, ar) => ar.findIndex((b) => a.name === b.name) === i,
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
	return json(
		{
			apps,
			processes,
			testProcesses,
			inspectorRunning: global.__inspector_open__,
		},
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case 'clear-data': {
			await clearData()
			return json({ success: true })
		}
		case 'clear-caches': {
			await clearCaches()
			return json({ success: true })
		}
		case 'inspect': {
			await startInspector()
			return json({ success: true })
		}
		case 'stop-inspect': {
			await stopInspector()
			return json({ success: true })
		}
		default: {
			throw new Error(`Unknown intent: ${intent}`)
		}
	}
}

function sortProgress(a: SerializedProgress, b: SerializedProgress) {
	return a.type === 'unknown' && b.type === 'unknown'
		? 0
		: a.type === 'unknown'
			? -1
			: b.type === 'unknown'
				? 1
				: 0
}

function linkProgress(progress: SerializedProgress) {
	switch (progress.type) {
		case 'workshop-instructions':
			return '/'
		case 'workshop-finished':
			return '/finished'
		case 'instructions':
			return `/${progress.exerciseNumber.toString().padStart(2, '0')}`
		case 'step':
			return `/${progress.exerciseNumber
				.toString()
				.padStart(2, '0')}/${progress.stepNumber.toString().padStart(2, '0')}`
		case 'finished':
			return `/${progress.exerciseNumber.toString().padStart(2, '0')}/finished`
		default:
			return ''
	}
}

export default function AdminLayout() {
	const data = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const epicProgress = useEpicProgress()

	const isStartingInspector = navigation.formData?.get('intent') === 'inspect'
	const isStoppingInspector =
		navigation.formData?.get('intent') === 'stop-inspect'

	const progressStatus = {
		completed: 'bg-blue-500',
		incomplete: 'bg-yellow-500',
	}

	return (
		<main className="container mx-auto mt-8">
			<h1 className="text-4xl font-bold">Admin</h1>
			<div className="flex flex-col gap-4">
				<nav>
					<ul className="flex gap-3">
						<li>
							<Link className="underline" to="/">
								Home
							</Link>
						</li>
						<li>
							<Link className="underline" to="/diff">
								Diff Viewer
							</Link>
						</li>
					</ul>
				</nav>
				<div>
					<h2 className="text-lg font-bold">Progress</h2>
					{epicProgress ? (
						<ul className="flex max-h-72 flex-col gap-2 overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
							{epicProgress.sort(sortProgress).map((progress) => {
								const status = progress.epicCompletedAt
									? 'completed'
									: 'incomplete'
								const label = [
									progress.epicLessonSlug,
									progress.epicCompletedAt
										? `(${progress.epicCompletedAt})`
										: null,
								]
									.filter(Boolean)
									.join(' ')
								return (
									<li
										key={progress.epicLessonSlug}
										className="flex items-center gap-2"
									>
										<span
											className={`h-3 w-3 rounded-full ${progressStatus[status]}`}
											title={status}
										/>
										{progress.type === 'unknown' ? (
											<span className="flex items-center gap-1">
												{label}
												<span className="text-red-500">
													<SimpleTooltip content="This video is in the workshop on EpicWeb.dev, but not in the local workshop.">
														<Icon name="Close" />
													</SimpleTooltip>
												</span>
											</span>
										) : (
											<Link to={linkProgress(progress)}>{label}</Link>
										)}
										<Link to={progress.epicLessonUrl}>
											<Icon name="ExternalLink"></Icon>
										</Link>
									</li>
								)
							})}
						</ul>
					) : (
						<p>No progress data</p>
					)}
				</div>
				<div>
					<h2 className="text-lg font-bold">Commands</h2>
					<ul className="max-h-48 overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
						<li>
							<Form method="POST">
								<button name="intent" value="clear-caches">
									Clear local caches
								</button>
							</Form>
						</li>
						<li>
							<Form method="POST">
								<button name="intent" value="clear-data">
									Clear all local data (including auth data)
								</button>
							</Form>
						</li>
						<li>
							{data.inspectorRunning ? (
								<Form method="POST">
									<button name="intent" value="stop-inspect">
										{isStartingInspector
											? 'Stopping inspector...'
											: 'Stop inspector'}
									</button>
								</Form>
							) : (
								<Form method="POST">
									<button name="intent" value="inspect">
										{isStoppingInspector
											? 'Starting inspector...'
											: 'Start inspector'}
									</button>
								</Form>
							)}
						</li>
					</ul>
				</div>
				<div>
					<h2 className="text-lg font-bold">Apps</h2>
					<ul className="max-h-48 list-none overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
						{data.apps.map((app) => (
							<li key={app.name} className="flex items-center gap-2 py-1">
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
					<h2 className="text-lg font-bold">Processes</h2>
					<ul className="overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
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
					<h2 className="text-lg font-bold">Test Processes</h2>
					<ul className="overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
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
		</main>
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
