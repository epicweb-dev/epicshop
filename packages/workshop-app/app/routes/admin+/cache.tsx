import {
	getAllWorkshopCaches,
	deleteCacheEntry,
	deleteWorkshopCache,
	updateCacheEntry,
} from '@epic-web/workshop-utils/cache.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import dayjsLib from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime.js'
import utcPlugin from 'dayjs/plugin/utc.js'
import { useState, useEffect, useRef } from 'react'
import { href, useFetcher, useSearchParams } from 'react-router'
import { ClientOnly } from 'remix-utils/client-only'
import { z } from 'zod'
import {
	Button,
	IconButton,
	iconButtonClassName,
} from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import {
	cn,
	ensureUndeployed,
	useDoubleCheck,
	useInterval,
} from '#app/utils/misc.js'
import { type Route } from './+types/cache.ts'

// Set up dayjs for client-side use - do this in a function to avoid hydration issues
function setupDayjs() {
	dayjsLib.extend(utcPlugin)
	dayjsLib.extend(relativeTimePlugin)
	return dayjsLib
}

// Cache expiration utilities
function calculateExpirationTime(metadata: {
	createdTime: number
	ttl?: number | null
}): number | null {
	const { createdTime, ttl } = metadata
	if (ttl === undefined || ttl === null || ttl === Infinity) {
		return null // Never expires
	}
	return createdTime + ttl
}

function formatTimeRemaining(expirationTime: number): {
	text: string
	isExpired: boolean
	isExpiringSoon: boolean
} {
	const now = Date.now()
	const remaining = expirationTime - now

	if (remaining <= 0) {
		return { text: 'Expired', isExpired: true, isExpiringSoon: false }
	}

	const seconds = Math.floor(remaining / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	let text: string
	let isExpiringSoon: boolean

	if (days > 0) {
		text = `${days}d ${hours % 24}h`
		isExpiringSoon = days < 1.5
	} else if (hours > 0) {
		text = `${hours}h ${minutes % 60}m`
		isExpiringSoon = hours < 2
	} else if (minutes > 0) {
		text = `${minutes}m ${seconds % 60}s`
		isExpiringSoon = minutes < 10
	} else {
		text = `${seconds}s`
		isExpiringSoon = true
	}

	return { text, isExpired: false, isExpiringSoon }
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60000) return `${Math.round(ms / 1000)}s`
	if (ms < 3600000) return `${Math.round(ms / 60000)}m`
	if (ms < 86400000) return `${Math.round(ms / 3600000)}h`
	if (ms < 604800000) return `${Math.round(ms / 86400000)}d`
	if (ms < 2629746000) return `${Math.round(ms / 604800000)}w`
	if (ms < 31556952000) return `${Math.round(ms / 2629746000)}mo`
	return `${Math.round(ms / 31556952000)}y`
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// Component for displaying cache metadata with live countdown
function CacheMetadata({
	metadata,
}: {
	metadata: {
		createdTime: number
		ttl?: number | null
		swr?: number
	}
}) {
	const [dayjs] = useState(() => setupDayjs())
	const [, setCurrentTime] = useState(Date.now())
	const expirationTime = calculateExpirationTime(metadata)

	// Update time every second for live countdown
	useInterval(() => {
		setCurrentTime(Date.now())
	}, 1000)

	const createdDate = dayjs(metadata.createdTime)
	const timeRemaining = expirationTime
		? formatTimeRemaining(expirationTime)
		: { text: 'Never', isExpired: false, isExpiringSoon: false }

	return (
		<div className="flex flex-col gap-1 text-xs text-muted-foreground">
			<div>
				Created: {createdDate.format('MMM D, YYYY HH:mm:ss')}{' '}
				<ClientOnly>{() => `(${createdDate.fromNow()})`}</ClientOnly>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				{metadata.ttl !== undefined && metadata.ttl !== null ? (
					<span>
						TTL:{' '}
						{metadata.ttl === Infinity ? (
							'Forever'
						) : (
							<span title={`${metadata.ttl}ms`}>
								{formatDuration(metadata.ttl)}
							</span>
						)}
					</span>
				) : null}
				{metadata.swr !== undefined ? (
					<span>
						SWR:{' '}
						<span title={`${metadata.swr}ms`}>
							{formatDuration(metadata.swr)}
						</span>
					</span>
				) : null}
				<div
					className={`inline-flex w-auto rounded-full px-2 py-[2px] font-medium ${
						timeRemaining.isExpired
							? 'bg-destructive text-destructive-foreground'
							: timeRemaining.isExpiringSoon
								? 'bg-warning text-warning-foreground'
								: 'text-foreground'
					}`}
				>
					{expirationTime ? (
						<>
							Expires: {dayjs(expirationTime).format('MMM D, YYYY HH:mm:ss')} (
							<span className="tabular-nums">
								<ClientOnly>{() => timeRemaining.text}</ClientOnly>
							</span>
							)
						</>
					) : (
						'Expires: Never'
					)}
				</div>
			</div>
		</div>
	)
}

// Double-check delete button
function DoubleCheckButton({
	onConfirm,
	children,
	className,
	...props
}: React.ComponentPropsWithoutRef<'button'> & {
	onConfirm: () => void
}) {
	const doubleCheck = useDoubleCheck()

	return (
		<IconButton
			{...doubleCheck.getButtonProps({
				onClick: doubleCheck.doubleCheck ? onConfirm : undefined,
				...props,
			})}
			className={cn(
				doubleCheck.doubleCheck
					? 'bg-destructive text-destructive-foreground'
					: null,
				className,
			)}
		>
			{doubleCheck.doubleCheck ? '✓' : children}
		</IconButton>
	)
}

const ActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('delete-entry'),
		workshopId: z.string(),
		cacheName: z.string(),
		filename: z.string(),
	}),
	z.object({
		intent: z.literal('delete-cache'),
		workshopId: z.string(),
		cacheName: z.string(),
	}),
	z.object({
		intent: z.literal('delete-workshop-cache'),
		workshopId: z.string(),
	}),
	z.object({
		intent: z.literal('update-entry'),
		workshopId: z.string(),
		cacheName: z.string(),
		filename: z.string(),
		newValue: z.string(),
	}),
])

export async function action({ request }: Route.ActionArgs) {
	ensureUndeployed()

	const formData = await request.formData()
	const rawData = Object.fromEntries(formData.entries())
	const result = ActionSchema.safeParse(rawData)

	if (!result.success) {
		return { status: 'error', error: 'Invalid request' } as const
	}

	const data = result.data

	try {
		switch (data.intent) {
			case 'delete-entry': {
				const path = `${data.workshopId}/${data.cacheName}/${data.filename}`
				await deleteCacheEntry(path)
				return { status: 'success', message: 'Cache entry deleted' } as const
			}
			case 'delete-cache': {
				await deleteWorkshopCache(data.workshopId, data.cacheName)
				return { status: 'success', message: 'Cache deleted' } as const
			}
			case 'delete-workshop-cache': {
				await deleteWorkshopCache(data.workshopId)
				return { status: 'success', message: 'Workshop cache deleted' } as const
			}
			case 'update-entry': {
				const path = `${data.workshopId}/${data.cacheName}/${data.filename}`
				try {
					const parsedValue = JSON.parse(data.newValue)
					await updateCacheEntry(path, parsedValue)
					return { status: 'success', message: 'Cache entry updated' } as const
				} catch (error) {
					return {
						status: 'error',
						error: getErrorMessage(error, 'Invalid JSON value'),
					} as const
				}
			}
		}
	} catch (error) {
		console.error('Cache action error:', error)
		return { status: 'error', error: 'Operation failed' } as const
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	ensureUndeployed()
	const currentWorkshopId = getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID
	const allWorkshopCaches = await getAllWorkshopCaches()

	const url = new URL(request.url)
	const filterQuery = url.searchParams.get('q') || ''
	const selectedWorkshops = url.searchParams
		.get('workshops')
		?.split(',')
		.filter(Boolean) || [currentWorkshopId]

	// Filter caches based on search query and selected workshops
	const filteredCaches = allWorkshopCaches
		.filter(
			(workshopCache) =>
				selectedWorkshops.includes(workshopCache.workshopId) ||
				selectedWorkshops.length === 0,
		)
		.map((workshopCache) => ({
			...workshopCache,
			caches: workshopCache.caches
				.map((cache) => ({
					...cache,
					entries: cache.entries.filter(
						(entry) =>
							filterQuery === '' ||
							entry.key.toLowerCase().includes(filterQuery.toLowerCase()) ||
							cache.name.toLowerCase().includes(filterQuery.toLowerCase()),
					),
				}))
				.filter((cache) => cache.entries.length > 0 || filterQuery === ''),
		}))
		.filter(
			(workshopCache) => workshopCache.caches.length > 0 || filterQuery === '',
		)

	return {
		currentWorkshopId,
		allWorkshopCaches,
		filteredCaches,
		filterQuery,
		selectedWorkshops,
		availableWorkshops: allWorkshopCaches.map((w) => w.workshopId),
	}
}

function WorkshopChooser({
	selectedWorkshops,
	availableWorkshops,
	currentWorkshopId,
}: {
	selectedWorkshops: string[]
	availableWorkshops: string[]
	currentWorkshopId: string
}) {
	const [searchParams, setSearchParams] = useSearchParams()

	const handleWorkshopChange = (workshop: string, checked: boolean) => {
		const newSelected = checked
			? [...selectedWorkshops, workshop]
			: selectedWorkshops.filter((w) => w !== workshop)

		const params = new URLSearchParams(searchParams)
		if (newSelected.length > 0) {
			params.set('workshops', newSelected.join(','))
		} else {
			params.delete('workshops')
		}
		setSearchParams(params)
	}

	return (
		<div className="mb-6">
			<h3 className="mb-3 text-lg font-semibold">Workshop Filter</h3>
			<div className="flex flex-wrap gap-3">
				{availableWorkshops.map((workshop) => (
					<label key={workshop} className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={selectedWorkshops.includes(workshop)}
							onChange={(e) => handleWorkshopChange(workshop, e.target.checked)}
							className="rounded"
						/>
						<span
							className={`text-sm ${workshop === currentWorkshopId ? 'font-bold text-primary' : ''}`}
						>
							{workshop} {workshop === currentWorkshopId ? '(current)' : null}
						</span>
					</label>
				))}
			</div>
		</div>
	)
}

function SearchFilter({ filterQuery }: { filterQuery: string }) {
	const [searchParams, setSearchParams] = useSearchParams()
	const [inputValue, setInputValue] = useState(filterQuery)
	const inputRef = useRef<HTMLInputElement>(null)

	// Update input value when filterQuery changes (e.g., from URL)
	useEffect(() => {
		setInputValue(filterQuery)
	}, [filterQuery])

	const handleSearch = (query: string) => {
		const params = new URLSearchParams(searchParams)
		if (query) {
			params.set('q', query)
		} else {
			params.delete('q')
		}
		setSearchParams(params)
	}

	const handleClear = () => {
		setInputValue('')
		handleSearch('')
		inputRef.current?.focus()
	}

	return (
		<div className="mb-6">
			<h3 className="mb-3 text-lg font-semibold">Search Cache Entries</h3>
			<div className="flex gap-2">
				<input
					ref={inputRef}
					type="text"
					placeholder="Search by key or cache name..."
					value={inputValue}
					onChange={(e) => {
						setInputValue(e.target.value)
						handleSearch(e.target.value)
					}}
					className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				{inputValue ? (
					<IconButton onClick={handleClear} title="Clear search">
						<Icon name="Close" className="h-4 w-4" />
					</IconButton>
				) : null}
			</div>
		</div>
	)
}

// Inline entry editor component
function InlineEntryEditor({
	workshopId,
	cacheName,
	filename,
	currentValue,
	entryKey,
}: {
	workshopId: string
	cacheName: string
	filename: string
	currentValue: any
	entryKey: string
}) {
	const fetcher = useFetcher<typeof action>()
	const [editValue, setEditValue] = useState(
		JSON.stringify(currentValue, null, 2),
	)
	const [hasChanges, setHasChanges] = useState(false)

	const handleSave = () => {
		void fetcher.submit(
			{
				intent: 'update-entry',
				workshopId,
				cacheName,
				filename,
				newValue: editValue,
			},
			{ method: 'POST' },
		)
		setHasChanges(false)
	}

	const handleChange = (value: string) => {
		setEditValue(value)
		setHasChanges(value !== JSON.stringify(currentValue, null, 2))
	}

	const handleReset = () => {
		setEditValue(JSON.stringify(currentValue, null, 2))
		setHasChanges(false)
	}

	return (
		<details className="mt-2">
			<summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
				Edit entry details
			</summary>
			<div className="mt-2 space-y-3 rounded border border-border bg-muted p-3">
				<div>
					<label className="mb-1 block text-sm font-medium">Key:</label>
					<code className="rounded border bg-background px-2 py-1 text-sm">
						{entryKey}
					</code>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Value:</label>
					<textarea
						value={editValue}
						onChange={(e) => handleChange(e.target.value)}
						className="resize-vertical h-32 w-full rounded border border-border bg-background p-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						placeholder="Enter JSON value..."
					/>
				</div>
				<div className="flex gap-2">
					<Button
						varient="primary"
						onClick={handleSave}
						disabled={!hasChanges || fetcher.state !== 'idle'}
					>
						{fetcher.state !== 'idle' ? 'Saving...' : 'Save'}
					</Button>
					<Button varient="mono" onClick={handleReset} disabled={!hasChanges}>
						Reset
					</Button>
				</div>
			</div>
		</details>
	)
}

function SkippedFilesSection({
	skippedFiles,
	workshopId,
	cacheName,
}: {
	skippedFiles: Array<{
		filename: string
		error: string
		size: number
		skipped: true
	}>
	workshopId: string
	cacheName: string
}) {
	const fetcher = useFetcher<typeof action>()

	if (skippedFiles.length === 0) return null

	return (
		<div className="mt-4 rounded border border-warning bg-warning p-3">
			<div className="mb-2 flex items-center gap-2">
				<Icon
					name="TriangleAlert"
					className="h-4 w-4 text-warning-foreground"
				/>
				<h5 className="font-medium text-warning-foreground">
					Skipped Files ({skippedFiles.length})
				</h5>
			</div>
			<p className="mb-3 text-sm text-warning-foreground/80">
				These cache files were skipped because they exceed the 3MB size limit:
			</p>
			<div className="space-y-2">
				{skippedFiles.map((skippedFile) => (
					<div
						key={skippedFile.filename}
						className="flex items-center justify-between rounded border border-warning/20 bg-warning/5 p-2"
					>
						<div className="min-w-0 flex-1">
							<div className="truncate font-mono text-sm font-medium text-warning-foreground">
								{skippedFile.filename}
							</div>
							<div className="text-xs text-warning-foreground/70">
								{skippedFile.error} • Size:{' '}
								<span title={`${skippedFile.size} bytes`}>
									{formatFileSize(skippedFile.size)}
								</span>
							</div>
						</div>
						<div className="ml-2 flex flex-shrink-0">
							<DoubleCheckButton
								onConfirm={() => {
									void fetcher.submit(
										{
											intent: 'delete-entry',
											workshopId,
											cacheName,
											filename: skippedFile.filename,
										},
										{ method: 'POST' },
									)
								}}
								title="Delete large cache file"
								className="text-destructive-foreground hover:bg-destructive/20 hover:text-destructive-foreground"
							>
								<Icon name="Remove" className="h-4 w-4" />
							</DoubleCheckButton>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

export default function CacheManagement({ loaderData }: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>()

	const deleteEntry = (
		workshopId: string,
		cacheName: string,
		filename: string,
	) => {
		void fetcher.submit(
			{
				intent: 'delete-entry',
				workshopId,
				cacheName,
				filename,
			},
			{ method: 'POST' },
		)
	}

	const deleteCache = (workshopId: string, cacheName: string) => {
		void fetcher.submit(
			{
				intent: 'delete-cache',
				workshopId,
				cacheName,
			},
			{ method: 'POST' },
		)
	}

	const deleteWorkshopCache = (workshopId: string) => {
		void fetcher.submit(
			{
				intent: 'delete-workshop-cache',
				workshopId,
			},
			{ method: 'POST' },
		)
	}

	const {
		currentWorkshopId,
		filteredCaches,
		filterQuery,
		selectedWorkshops,
		availableWorkshops,
	} = loaderData

	return (
		<div className="space-y-6">
			<div>
				<h2 className="mb-2 text-2xl font-bold">Cache Management</h2>
				<p className="text-muted-foreground">
					Current Workshop:{' '}
					<span className="font-semibold text-foreground">
						{currentWorkshopId}
					</span>
				</p>
			</div>

			<WorkshopChooser
				selectedWorkshops={selectedWorkshops}
				availableWorkshops={availableWorkshops}
				currentWorkshopId={currentWorkshopId}
			/>

			<SearchFilter filterQuery={filterQuery} />

			{fetcher.data?.status === 'success' ? (
				<div className="rounded border border-border bg-success p-4 text-success-foreground">
					{fetcher.data.message}
				</div>
			) : null}

			{fetcher.data?.status === 'error' ? (
				<div className="rounded border border-border bg-destructive p-4 text-destructive-foreground">
					{fetcher.data.error}
				</div>
			) : null}

			{filteredCaches.length === 0 ? (
				<div className="py-8 text-center text-muted-foreground">
					No caches found matching your criteria.
				</div>
			) : null}

			<div className="space-y-6">
				{filteredCaches.map((workshopCache) => (
					<details
						key={workshopCache.workshopId}
						open={workshopCache.workshopId === currentWorkshopId}
					>
						<summary className="cursor-pointer rounded-lg border border-border bg-card p-4 hover:bg-accent">
							<div className="flex items-center justify-between">
								<h3 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
									<Icon name="Files" className="h-5 w-5" />
									{workshopCache.workshopId}
									{workshopCache.workshopId === currentWorkshopId ? (
										<span className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
											Current
										</span>
									) : null}
								</h3>
								<DoubleCheckButton
									onConfirm={() =>
										deleteWorkshopCache(workshopCache.workshopId)
									}
									title="Delete all workshop caches"
								>
									<Icon name="Remove" className="h-4 w-4" />
								</DoubleCheckButton>
							</div>
						</summary>

						<div className="mt-4 space-y-4 pl-4">
							{workshopCache.caches.map((cache) => {
								const totalSize = cache.entries.reduce(
									(sum, entry) => sum + (entry.size || 0),
									0,
								)
								const skippedSize = (cache.skippedFiles || []).reduce(
									(sum, file) => sum + file.size,
									0,
								)
								const grandTotal = totalSize + skippedSize

								return (
									<details key={cache.name} className="rounded-md bg-muted">
										<summary className="cursor-pointer p-3 hover:bg-accent">
											<div className="flex items-center justify-between">
												<h4 className="flex items-center gap-2 font-medium text-muted-foreground">
													<Icon name="Files" className="h-4 w-4" />
													{cache.name}
													<span className="text-sm">
														({cache.entries.length} entr
														{cache.entries.length === 1 ? 'y' : 'ies'})
													</span>
													{grandTotal > 0 ? (
														<span className="text-sm text-muted-foreground">
															•{' '}
															<span title={`${grandTotal} bytes`}>
																{formatFileSize(grandTotal)}
															</span>{' '}
															total
															{skippedSize > 0 ? (
																<span className="text-warning">
																	{' '}
																	(
																	<span title={`${skippedSize} bytes`}>
																		{formatFileSize(skippedSize)}
																	</span>{' '}
																	skipped)
																</span>
															) : null}
														</span>
													) : null}
												</h4>
												<DoubleCheckButton
													onConfirm={() =>
														deleteCache(workshopCache.workshopId, cache.name)
													}
													title="Delete cache"
												>
													<Icon name="Remove" className="h-4 w-4" />
												</DoubleCheckButton>
											</div>
										</summary>

										<div className="p-3 pt-0">
											{cache.entries.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													No entries match your search.
												</p>
											) : null}

											{cache.skippedFiles && cache.skippedFiles.length > 0 ? (
												<SkippedFilesSection
													skippedFiles={cache.skippedFiles}
													workshopId={workshopCache.workshopId}
													cacheName={cache.name}
												/>
											) : null}

											<div className="space-y-2">
												{cache.entries.map(
													({ key, entry, filename, size, filepath }) => (
														<div
															key={key}
															className="rounded border border-border bg-background p-3"
														>
															<div className="flex items-start justify-between">
																<div className="min-w-0 flex-1">
																	<div className="mb-1 flex items-center gap-2">
																		<div
																			className="truncate font-mono text-sm font-medium"
																			title={key}
																		>
																			{key}
																		</div>
																		{size ? (
																			<span
																				className="inline-flex items-center whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
																				title={`${size} bytes`}
																			>
																				{formatFileSize(size)}
																			</span>
																		) : null}
																	</div>
																	<CacheMetadata metadata={entry.metadata} />
																</div>
																<div className="ml-4 flex flex-shrink-0 gap-1">
																	<a
																		href={href('/admin/cache/*', {
																			'*': `${workshopCache.workshopId}/${cache.name}/${filename}`,
																		})}
																		target="_blank"
																		rel="noopener noreferrer"
																		className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
																		title="View JSON"
																	>
																		<Icon
																			name="ExternalLink"
																			className="h-4 w-4"
																		/>
																	</a>
																	{filepath ? (
																		<LaunchEditor
																			file={filepath}
																			className={iconButtonClassName}
																		>
																			<Icon
																				name="Files"
																				className="h-4 w-4"
																				title="Open in editor"
																			/>
																		</LaunchEditor>
																	) : null}
																	<DoubleCheckButton
																		onConfirm={() =>
																			deleteEntry(
																				workshopCache.workshopId,
																				cache.name,
																				filename,
																			)
																		}
																		title="Delete entry"
																	>
																		<Icon name="Remove" className="h-4 w-4" />
																	</DoubleCheckButton>
																</div>
															</div>
															<InlineEntryEditor
																workshopId={workshopCache.workshopId}
																cacheName={cache.name}
																filename={filename}
																currentValue={entry.value}
																entryKey={key}
															/>
														</div>
													),
												)}
											</div>
										</div>
									</details>
								)
							})}
						</div>
					</details>
				))}
			</div>
		</div>
	)
}
