import {
	deleteCacheEntry,
	deleteWorkshopCache,
	getAllWorkshopCaches,
	getGlobalCaches,
	globalCacheDirectoryExists,
	updateCacheEntry,
} from '@epic-web/workshop-utils/cache.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import { getErrorMessage } from '@epic-web/workshop-utils/utils'
import { useEffect, useRef, useState } from 'react'
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
	calculateExpirationTime,
	cn,
	ensureUndeployed,
	formatDuration,
	formatFileSize,
	formatTimeRemaining,
	useDayjs,
	useDoubleCheck,
	useInterval,
} from '#app/utils/misc.tsx'
import { type Route } from './+types/cache.ts'

export async function loader({ request }: Route.LoaderArgs) {
	ensureUndeployed()
	const currentWorkshopId = getEnv().EPICSHOP_WORKSHOP_INSTANCE_ID
	const allWorkshopCaches = await getAllWorkshopCaches()
	const globalCaches = await getGlobalCaches()
	const allCaches = [...allWorkshopCaches, ...globalCaches]

	const url = new URL(request.url)
	const filterQuery = url.searchParams.get('q') || ''

	// Ensure 'global' is always in available workshops if global cache directory exists
	const availableWorkshopIds = new Set(allCaches.map((w) => w.workshopId))
	const globalDirExists = await globalCacheDirectoryExists()
	if (globalDirExists) {
		availableWorkshopIds.add('global')
	}

	const selectedWorkshops = url.searchParams
		.get('workshops')
		?.split(',')
		.filter(Boolean) || [
		currentWorkshopId,
		...(globalDirExists ? ['global'] : []),
	]

	// Filter caches based on search query and selected workshops
	const filteredCaches = allCaches
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
		allWorkshopCaches: allCaches,
		filteredCaches,
		filterQuery,
		selectedWorkshops,
		availableWorkshops: Array.from(availableWorkshopIds),
	}
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
							className={`text-sm ${workshop === currentWorkshopId ? 'text-primary font-bold' : ''}`}
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
					className="border-border bg-background text-foreground focus:ring-ring flex-1 rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
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
			<summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
				Edit entry details
			</summary>
			<div className="border-border bg-muted mt-2 space-y-3 rounded border p-3">
				<div>
					<label className="mb-1 block text-sm font-medium">Key:</label>
					<code className="bg-background rounded border px-2 py-1 text-sm">
						{entryKey}
					</code>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium">Value:</label>
					<textarea
						value={editValue}
						onChange={(e) => handleChange(e.target.value)}
						className="resize-vertical border-border bg-background text-foreground focus:ring-ring h-32 w-full rounded border p-2 font-mono text-sm focus:ring-2 focus:outline-none"
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
		<div className="border-warning bg-warning mt-4 rounded border p-3">
			<div className="mb-2 flex items-center gap-2">
				<Icon
					name="TriangleAlert"
					className="text-warning-foreground h-4 w-4"
				/>
				<h5 className="text-warning-foreground font-medium">
					Skipped Files ({skippedFiles.length})
				</h5>
			</div>
			<p className="text-warning-foreground/80 mb-3 text-sm">
				These cache files were skipped because they exceed the 3MB size limit:
			</p>
			<div className="space-y-2">
				{skippedFiles.map((skippedFile) => (
					<div
						key={skippedFile.filename}
						className="border-warning/20 bg-warning/5 flex items-center justify-between rounded border p-2"
					>
						<div className="min-w-0 flex-1">
							<div className="text-warning-foreground truncate font-mono text-sm font-medium">
								{skippedFile.filename}
							</div>
							<div className="text-warning-foreground/70 text-xs">
								{skippedFile.error} • Size:{' '}
								<span title={`${skippedFile.size} bytes`}>
									{formatFileSize(skippedFile.size)}
								</span>
							</div>
						</div>
						<div className="ml-2 flex shrink-0">
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
					<span className="text-foreground font-semibold">
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
				<div className="border-border bg-success text-success-foreground rounded border p-4">
					{fetcher.data.message}
				</div>
			) : null}

			{fetcher.data?.status === 'error' ? (
				<div className="border-border bg-destructive text-destructive-foreground rounded border p-4">
					{fetcher.data.error}
				</div>
			) : null}

			{filteredCaches.length === 0 ? (
				<div className="text-muted-foreground py-8 text-center">
					No caches found matching your criteria.
				</div>
			) : null}

			<div className="space-y-6">
				{filteredCaches.map((workshopCache) => (
					<details
						key={workshopCache.workshopId}
						open={workshopCache.workshopId === currentWorkshopId}
					>
						<summary className="border-border bg-card hover:bg-accent cursor-pointer rounded-lg border p-4">
							<div className="flex items-center justify-between">
								<h3 className="text-card-foreground flex items-center gap-2 text-lg font-semibold">
									<Icon name="Files" className="h-5 w-5" />
									{workshopCache.workshopId === 'global'
										? 'Global Caches'
										: workshopCache.workshopId}
									{workshopCache.workshopId === currentWorkshopId ? (
										<span className="bg-primary text-primary-foreground rounded px-2 py-1 text-xs">
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
									<details key={cache.name} className="bg-muted rounded-md">
										<summary className="hover:bg-accent cursor-pointer p-3">
											<div className="flex items-center justify-between">
												<h4 className="text-muted-foreground flex items-center gap-2 font-medium">
													<Icon name="Files" className="h-4 w-4" />
													{cache.name}
													<span className="text-sm">
														({cache.entries.length} entr
														{cache.entries.length === 1 ? 'y' : 'ies'})
													</span>
													{grandTotal > 0 ? (
														<span className="text-muted-foreground text-sm">
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
												<p className="text-muted-foreground text-sm">
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
															className="border-border bg-background rounded border p-3"
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
																				className="bg-muted text-muted-foreground inline-flex items-center rounded px-1.5 py-0.5 text-xs whitespace-nowrap"
																				title={`${size} bytes`}
																			>
																				{formatFileSize(size)}
																			</span>
																		) : null}
																	</div>
																	<CacheMetadata metadata={entry.metadata} />
																</div>
																<div className="ml-4 flex shrink-0 gap-1">
																	<a
																		href={href('/admin/cache/*', {
																			'*': `${workshopCache.workshopId}/${cache.name}/${filename}`,
																		})}
																		target="_blank"
																		rel="noopener noreferrer"
																		className="border-border bg-background text-foreground hover:bg-muted focus:ring-ring inline-flex h-8 w-8 items-center justify-center rounded border focus:ring-2 focus:outline-none"
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
	const dayjs = useDayjs()
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
		<div className="text-muted-foreground flex flex-col gap-1 text-xs">
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
