import { getApps } from '@epic-web/workshop-utils/apps.server'
import { getProcesses } from '@epic-web/workshop-utils/process-manager.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { clsx } from 'clsx'
import { data, Form, Link, useNavigation } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import {
	useEpicProgress,
	type SerializedProgress,
} from '#app/routes/progress.tsx'
import { cn, ensureUndeployed } from '#app/utils/misc.tsx'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { type Route } from './+types/index.tsx'
import {
	clearCaches,
	clearData,
	isInspectorRunning,
	startInspector,
	stopInspector,
} from './admin-utils.server.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: Route.MetaFunction = ({ matches }) => {
	const rootData = getRootMatchLoaderData(matches)
	return [{ title: `👷 | ${rootData?.workshopTitle}` }]
}

export async function loader({ request }: Route.LoaderArgs) {
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
	return data(
		{
			apps,
			processes,
			testProcesses,
			inspectorRunning: isInspectorRunning(),
		},
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}

export async function action({ request }: Route.ActionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case 'clear-data': {
			await clearData()
			return { success: true }
		}
		case 'clear-caches': {
			await clearCaches()
			return { success: true }
		}
		case 'inspect': {
			await startInspector()
			return { success: true }
		}
		case 'stop-inspect': {
			await stopInspector()
			return { success: true }
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

export default function AdminLayout({
	loaderData: data,
}: Route.ComponentProps) {
	const navigation = useNavigation()
	const epicProgress = useEpicProgress()

	const isStartingInspector = navigation.formData?.get('intent') === 'inspect'
	const isStoppingInspector =
		navigation.formData?.get('intent') === 'stop-inspect'

	const progressStatus = {
		completed: 'bg-green-500',
		incomplete: 'bg-yellow-500',
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="mb-2">
				<h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage workshop settings and monitor processes
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Progress</CardTitle>
						<CardDescription>EpicWeb.dev lesson progress</CardDescription>
					</CardHeader>
					<CardContent>
						{epicProgress ? (
							<ul className="flex max-h-72 flex-col gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar">
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
											className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50"
										>
											<span
												className={clsx(
													'h-3 w-3 shrink-0 rounded-full',
													progressStatus[status],
												)}
												title={status}
											/>
											{progress.type === 'unknown' ? (
												<span className="flex flex-1 items-center gap-2 truncate text-sm">
													<span className="truncate">{label}</span>
													<SimpleTooltip content="This video is in the workshop on EpicWeb.dev, but not in the local workshop.">
														<Icon
															name="Close"
															className="h-4 w-4 shrink-0 text-destructive"
														/>
													</SimpleTooltip>
												</span>
											) : (
												<Link
													to={linkProgress(progress)}
													className="flex-1 truncate text-sm text-foreground hover:underline"
												>
													{label}
												</Link>
											)}
											<Link
												to={progress.epicLessonUrl}
												className="shrink-0 text-muted-foreground hover:text-foreground"
											>
												<Icon name="ExternalLink" className="h-4 w-4" />
											</Link>
										</li>
									)
								})}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">No progress data</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Commands</CardTitle>
						<CardDescription>Workshop management actions</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-3">
							<Form method="POST">
								<AdminButton name="intent" value="clear-caches">
									<Icon name="Clear" className="h-4 w-4" />
									Clear local caches
								</AdminButton>
							</Form>
							<Form method="POST">
								<AdminButton name="intent" value="clear-data">
									<Icon name="Clear" className="h-4 w-4" />
									Clear all local data (including auth data)
								</AdminButton>
							</Form>
							{data.inspectorRunning ? (
								<Form method="POST">
									<AdminButton name="intent" value="stop-inspect">
										<Icon name="Stop" className="h-4 w-4" />
										{isStartingInspector
											? 'Stopping inspector...'
											: 'Stop inspector'}
									</AdminButton>
								</Form>
							) : (
								<Form method="POST">
									<AdminButton name="intent" value="inspect">
										{isStoppingInspector
											? 'Starting inspector...'
											: 'Start inspector'}
									</AdminButton>
								</Form>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Apps</CardTitle>
						<CardDescription>Available workshop apps</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex max-h-48 flex-col gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar">
							{data.apps.length > 0 ? (
								data.apps.map((app) => (
									<li
										key={app.name}
										className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50"
									>
										{data.processes[app.name] ? (
											<Pinger status="running" />
										) : (
											<Pinger status="stopped" />
										)}
										<span className="font-mono text-sm">{app.name}</span>
									</li>
								))
							) : (
								<p className="text-sm text-muted-foreground">
									No apps available
								</p>
							)}
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Processes</CardTitle>
						<CardDescription>Running development processes</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex max-h-48 flex-col gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar">
							{Object.entries(data.processes).length > 0 ? (
								Object.entries(data.processes).map(([key, process]) => (
									<li
										key={key}
										className="rounded-md border border-border bg-muted/30 p-3"
									>
										<div className="flex items-center gap-2">
											<Pinger status="running" />
											<span className="font-mono text-sm font-semibold">
												{key}
											</span>
										</div>
										<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
											<span>
												<span className="font-medium">Port:</span>{' '}
												{process.port}
											</span>
											{process.pid && (
												<span>
													<span className="font-medium">PID:</span>{' '}
													{process.pid}
												</span>
											)}
											<span>
												<span className="font-medium">Color:</span>{' '}
												<span
													className="inline-block h-3 w-3 rounded-full"
													style={{ backgroundColor: process.color }}
												/>
											</span>
										</div>
									</li>
								))
							) : (
								<p className="text-sm text-muted-foreground">
									No processes running
								</p>
							)}
						</ul>
					</CardContent>
				</Card>

				{Object.entries(data.testProcesses).length > 0 && (
					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Test Processes</CardTitle>
							<CardDescription>Test execution processes</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="flex flex-col gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-scrollbar">
								{Object.entries(data.testProcesses).map(([key, process]) => (
									<li
										key={key}
										className="rounded-md border border-border bg-muted/30 p-3"
									>
										<div className="flex items-center gap-2">
											{process.exitCode === null ||
											process.exitCode === undefined ? (
												<Pinger status="running" />
											) : process.exitCode === 0 ? (
												<Pinger status="running" />
											) : (
												<Pinger status="taken" />
											)}
											<span className="font-mono text-sm font-semibold">
												{key}
											</span>
										</div>
										<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
											{process.pid && (
												<span>
													<span className="font-medium">PID:</span>{' '}
													{process.pid}
												</span>
											)}
											<span>
												<span className="font-medium">Exit code:</span>{' '}
												{process.exitCode === null ||
												process.exitCode === undefined
													? 'Running'
													: process.exitCode}
											</span>
										</div>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	)
}

function Card({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				'rounded-lg border border-border bg-card p-6 shadow-sm',
				className,
			)}
		>
			{children}
		</div>
	)
}

function CardHeader({ children }: { children: React.ReactNode }) {
	return <div className="mb-4">{children}</div>
}

function CardTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="text-lg font-semibold text-foreground">{children}</h2>
}

function CardDescription({ children }: { children: React.ReactNode }) {
	return <p className="mt-1 text-sm text-muted-foreground">{children}</p>
}

function CardContent({ children }: { children: React.ReactNode }) {
	return <div>{children}</div>
}

function AdminButton({
	children,
	...props
}: React.ComponentPropsWithoutRef<'button'>) {
	return (
		<button
			{...props}
			className={cn(
				'inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
				props.className,
			)}
		>
			{children}
		</button>
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
			circle: 'bg-muted-foreground',
		},
		taken: {
			pinger: 'bg-red-400',
			circle: 'bg-red-500',
		},
	}[status]
	return (
		<span className="relative flex h-3 w-3 shrink-0">
			{colors.pinger ? (
				<span
					className={clsx(
						'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
						colors.pinger,
					)}
				/>
			) : null}
			<span
				className={clsx(
					'relative inline-flex h-3 w-3 rounded-full',
					colors.circle,
				)}
			/>
		</span>
	)
}
