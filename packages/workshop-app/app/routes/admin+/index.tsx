import { getApps } from '@epic-web/workshop-utils/apps.server'
import { getProcesses } from '@epic-web/workshop-utils/process-manager.server'
import {
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { clsx } from 'clsx'
import * as React from 'react'
import { data, Form, Link, useFetcher, useNavigation } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import {
	useEpicProgress,
	type SerializedProgress,
} from '#app/routes/progress.tsx'
import { cn, ensureUndeployed, useDoubleCheck } from '#app/utils/misc.tsx'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { type Route } from './+types/index.tsx'
import {
	clearCaches,
	clearData,
	getSidecarLogLines,
	isInspectorRunning,
	restartSidecar,
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

	const sidecarProcesses: Record<string, { pid?: number; running: boolean }> =
		{}
	for (const [name, { process }] of getProcesses().sidecarProcesses.entries()) {
		sidecarProcesses[name] = {
			pid: process.pid,
			running: process.exitCode === null,
		}
	}

	return data(
		{
			apps,
			processes,
			testProcesses,
			sidecarProcesses,
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
		case 'restart-sidecar': {
			const name = formData.get('name')
			if (typeof name !== 'string') {
				throw new Error('Sidecar name is required')
			}
			const success = await restartSidecar(name)
			return { success }
		}
		case 'get-sidecar-logs': {
			const name = formData.get('name')
			if (typeof name !== 'string') {
				throw new Error('Sidecar name is required')
			}
			const logs = getSidecarLogLines(name, 1000)
			return { success: true, logs }
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
		completed: 'bg-success',
		incomplete: 'bg-warning',
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="mb-2">
				<h1 className="text-foreground text-2xl font-bold">Admin Panel</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Manage workshop settings and monitor processes
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{Object.entries(data.sidecarProcesses).length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Sidecar Processes</CardTitle>
							<CardDescription>Background sidecar processes</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="flex flex-col gap-2">
								{Object.entries(data.sidecarProcesses).map(([key, process]) => (
									<SidecarProcessItem
										key={key}
										name={key}
										pid={process.pid}
										running={process.running}
									/>
								))}
							</ul>
						</CardContent>
					</Card>
				)}

				<Card>
					<CardHeader>
						<CardTitle>Commands</CardTitle>
						<CardDescription>Workshop management actions</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-3">
							<Form method="POST">
								<DoubleCheckAdminButton name="intent" value="clear-caches">
									<Icon name="Clear" className="h-4 w-4" />
									Clear local caches
								</DoubleCheckAdminButton>
							</Form>
							<Form method="POST">
								<DoubleCheckAdminButton
									name="intent"
									value="clear-data"
									className="border-destructive bg-destructive/80 text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground"
									doubleCheckClassName="border-destructive bg-destructive text-destructive-foreground"
								>
									<Icon name="TriangleAlert" className="h-4 w-4" />
									Clear all local data (including auth data)
								</DoubleCheckAdminButton>
							</Form>
							{data.inspectorRunning ? (
								<Form method="POST">
									<AdminButton name="intent" value="stop-inspect">
										<Icon name="Stop" className="h-4 w-4" />
										{isStoppingInspector
											? 'Stopping inspector...'
											: 'Stop inspector'}
									</AdminButton>
								</Form>
							) : (
								<Form method="POST">
									<AdminButton name="intent" value="inspect">
										{isStartingInspector
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
						<ul className="scrollbar-thin scrollbar-thumb-scrollbar flex max-h-48 flex-col gap-2 overflow-y-auto">
							{data.apps.length > 0 ? (
								data.apps.map((app) => (
									<li
										key={app.name}
										className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2"
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
								<p className="text-muted-foreground text-sm">
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
						<ul className="scrollbar-thin scrollbar-thumb-scrollbar flex max-h-48 flex-col gap-2 overflow-y-auto">
							{Object.entries(data.processes).length > 0 ? (
								Object.entries(data.processes).map(([key, process]) => (
									<li
										key={key}
										className="border-border bg-muted/30 rounded-md border p-3"
									>
										<div className="flex items-center gap-2">
											<Pinger status="running" />
											<span className="font-mono text-sm font-semibold">
												{key}
											</span>
										</div>
										<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
								<p className="text-muted-foreground text-sm">
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
							<ul className="scrollbar-thin scrollbar-thumb-scrollbar flex flex-col gap-2 overflow-y-auto">
								{Object.entries(data.testProcesses).map(([key, process]) => (
									<li
										key={key}
										className="border-border bg-muted/30 rounded-md border p-3"
									>
										<div className="flex items-center gap-2">
											{process.exitCode === null ||
											process.exitCode === undefined ? (
												<Pinger status="running" />
											) : process.exitCode === 0 ? (
												<Pinger status="stopped" />
											) : (
												<Pinger status="taken" />
											)}
											<span className="font-mono text-sm font-semibold">
												{key}
											</span>
										</div>
										<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
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

				<Card>
					<CardHeader>
						<CardTitle>Progress</CardTitle>
						<CardDescription>EpicWeb.dev lesson progress</CardDescription>
					</CardHeader>
					<CardContent>
						{epicProgress ? (
							<ul className="scrollbar-thin scrollbar-thumb-scrollbar flex max-h-72 flex-col gap-2 overflow-y-auto">
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
											className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2"
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
															className="text-destructive h-4 w-4 shrink-0"
														/>
													</SimpleTooltip>
												</span>
											) : (
												<Link
													to={linkProgress(progress)}
													className="text-foreground flex-1 truncate text-sm hover:underline"
												>
													{label}
												</Link>
											)}
											<Link
												to={progress.epicLessonUrl}
												className="text-muted-foreground hover:text-foreground shrink-0"
											>
												<Icon name="ExternalLink" className="h-4 w-4" />
											</Link>
										</li>
									)
								})}
							</ul>
						) : (
							<p className="text-muted-foreground text-sm">No progress data</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

function SidecarProcessItem({
	name,
	pid,
	running,
}: {
	name: string
	pid?: number
	running: boolean
}) {
	const restartFetcher = useFetcher()
	const logsFetcher = useFetcher<{ logs?: string }>()
	const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied'>('idle')
	const [logsOpen, setLogsOpen] = React.useState(false)
	const [displayLogs, setDisplayLogs] = React.useState<string | null>(null)

	const isRestarting = restartFetcher.state !== 'idle'
	const isLoadingLogs = logsFetcher.state !== 'idle'

	// Update display logs when fetcher returns data
	React.useEffect(() => {
		if (logsFetcher.data) {
			setDisplayLogs(logsFetcher.data.logs ?? '')
		}
	}, [logsFetcher.data])

	const handleCopyLogs = () => {
		if (!displayLogs) return
		navigator.clipboard
			.writeText(displayLogs)
			.then(() => {
				setCopyStatus('copied')
				setTimeout(() => setCopyStatus('idle'), 2000)
			})
			.catch(() => {
				// silently fail
			})
	}

	const handleToggleLogs = (open: boolean) => {
		setLogsOpen(open)
		if (open) {
			// Fetch logs when opening
			void logsFetcher.submit(
				{ intent: 'get-sidecar-logs', name },
				{ method: 'POST' },
			)
		}
	}

	return (
		<li className="border-border bg-muted/30 rounded-md border p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{running ? <Pinger status="running" /> : <Pinger status="taken" />}
					<span className="font-mono text-sm font-semibold">{name}</span>
				</div>
				<div className="flex items-center gap-1">
					<restartFetcher.Form method="POST">
						<input type="hidden" name="intent" value="restart-sidecar" />
						<input type="hidden" name="name" value={name} />
						<SimpleTooltip content="Restart process">
							<button
								type="submit"
								disabled={isRestarting}
								className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Icon
									name="Refresh"
									className={cn('h-4 w-4', isRestarting && 'animate-spin')}
								/>
							</button>
						</SimpleTooltip>
					</restartFetcher.Form>
				</div>
			</div>
			<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{pid && (
					<span>
						<span className="font-medium">PID:</span> {pid}
					</span>
				)}
				<span>
					<span className="font-medium">Status:</span>{' '}
					{isRestarting ? 'Restarting...' : running ? 'Running' : 'Failed'}
				</span>
			</div>
			<details
				className="mt-3"
				open={logsOpen}
				onToggle={(e) => handleToggleLogs(e.currentTarget.open)}
			>
				<summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium">
					{isLoadingLogs ? 'Loading logs...' : 'View logs'}
				</summary>
				<div className="mt-2">
					<div className="mb-1 flex justify-end">
						<SimpleTooltip
							content={copyStatus === 'copied' ? 'Copied!' : 'Copy logs'}
						>
							<button
								type="button"
								onClick={handleCopyLogs}
								disabled={!displayLogs}
								className={cn(
									'text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
									copyStatus === 'copied' && 'text-success',
								)}
							>
								<Icon
									name={copyStatus === 'copied' ? 'CheckSmall' : 'Copy'}
									className="h-3.5 w-3.5"
								/>
							</button>
						</SimpleTooltip>
					</div>
					<pre className="scrollbar-thin scrollbar-thumb-scrollbar bg-background max-h-96 overflow-auto rounded border p-2 text-xs">
						{displayLogs ||
							(isLoadingLogs ? 'Loading...' : 'No logs available')}
					</pre>
				</div>
			</details>
		</li>
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
				'border-border bg-card rounded-lg border p-6 shadow-sm',
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
	return <h2 className="text-foreground text-lg font-semibold">{children}</h2>
}

function CardDescription({ children }: { children: React.ReactNode }) {
	return <p className="text-muted-foreground mt-1 text-sm">{children}</p>
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
				'border-border bg-background text-foreground hover:bg-muted hover:text-foreground focus:ring-ring inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none disabled:opacity-50',
				props.className,
			)}
		>
			{children}
		</button>
	)
}

function DoubleCheckAdminButton({
	children,
	doubleCheckClassName,
	...props
}: React.ComponentPropsWithoutRef<'button'> & {
	doubleCheckClassName?: string
}) {
	const { doubleCheck, getButtonProps } = useDoubleCheck()

	return (
		<AdminButton
			{...getButtonProps(props)}
			className={cn(
				props.className,
				doubleCheck
					? (doubleCheckClassName ??
							'border-destructive bg-destructive text-destructive-foreground')
					: null,
			)}
		>
			{doubleCheck ? (
				<>
					<Icon name="TriangleAlert" className="h-4 w-4" />
					Are you sure?
				</>
			) : (
				children
			)}
		</AdminButton>
	)
}

function Pinger({
	status,
}: {
	status: 'running' | 'starting' | 'stopped' | 'taken'
}) {
	const colors = {
		running: {
			pinger: 'bg-success/60',
			circle: 'bg-success',
		},
		starting: {
			pinger: 'bg-info/60',
			circle: 'bg-info',
		},
		stopped: {
			circle: 'bg-muted-foreground',
		},
		taken: {
			pinger: 'bg-destructive/60',
			circle: 'bg-destructive',
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
