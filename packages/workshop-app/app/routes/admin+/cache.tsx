import { 
	getAllWorkshopCaches, 
	deleteCacheEntry, 
	deleteWorkshopCache, 
	updateCacheEntry 
} from '@epic-web/workshop-utils/cache.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import { useState } from 'react'
import { href, useFetcher, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { 
	Dialog, 
	DialogContent, 
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger 
} from '#app/components/ui/dialog.tsx'
import { ensureUndeployed } from '#app/utils/misc.js'
import { type Route } from './+types/cache.ts'

// Icon-only button component without clip-path styling
function IconButton({ 
	children, 
	className = '', 
	...props 
}: React.ComponentPropsWithoutRef<'button'>) {
	return (
		<button
			{...props}
			className={`inline-flex items-center justify-center w-8 h-8 rounded border border-border bg-background text-foreground hover:bg-muted focus:bg-muted focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
		>
			{children}
		</button>
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
				} catch {
					return { status: 'error', error: 'Invalid JSON value' } as const
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
	const selectedWorkshops = url.searchParams.get('workshops')?.split(',').filter(Boolean) || [currentWorkshopId]
	
	// Filter caches based on search query and selected workshops
	const filteredCaches = allWorkshopCaches
		.filter(workshopCache => 
			selectedWorkshops.includes(workshopCache.workshopId) ||
			selectedWorkshops.length === 0
		)
		.map(workshopCache => ({
			...workshopCache,
			caches: workshopCache.caches
				.map(cache => ({
					...cache,
					entries: cache.entries.filter(entry =>
						filterQuery === '' ||
						entry.key.toLowerCase().includes(filterQuery.toLowerCase()) ||
						cache.name.toLowerCase().includes(filterQuery.toLowerCase())
					)
				}))
				.filter(cache => cache.entries.length > 0 || filterQuery === '')
		}))
		.filter(workshopCache => workshopCache.caches.length > 0 || filterQuery === '')
	
	return { 
		currentWorkshopId, 
		allWorkshopCaches, 
		filteredCaches,
		filterQuery,
		selectedWorkshops,
		availableWorkshops: allWorkshopCaches.map(w => w.workshopId)
	}
}

function WorkshopChooser({ 
	selectedWorkshops, 
	availableWorkshops, 
	currentWorkshopId 
}: {
	selectedWorkshops: string[]
	availableWorkshops: string[]
	currentWorkshopId: string
}) {
	const [searchParams, setSearchParams] = useSearchParams()
	
	const handleWorkshopChange = (workshop: string, checked: boolean) => {
		const newSelected = checked 
			? [...selectedWorkshops, workshop]
			: selectedWorkshops.filter(w => w !== workshop)
		
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
			<h3 className="text-lg font-semibold mb-3">Workshop Filter</h3>
			<div className="flex flex-wrap gap-3">
				{availableWorkshops.map(workshop => (
					<label key={workshop} className="flex items-center gap-2">
						<input 
							type="checkbox"
							checked={selectedWorkshops.includes(workshop)}
							onChange={(e) => handleWorkshopChange(workshop, e.target.checked)}
							className="rounded"
						/>
						<span className={`text-sm ${workshop === currentWorkshopId ? 'font-bold text-blue-600' : ''}`}>
							{workshop} {workshop === currentWorkshopId && '(current)'}
						</span>
					</label>
				))}
			</div>
		</div>
	)
}

function SearchFilter({ filterQuery }: { filterQuery: string }) {
	const [searchParams, setSearchParams] = useSearchParams()
	
	const handleSearch = (query: string) => {
		const params = new URLSearchParams(searchParams)
		if (query) {
			params.set('q', query)
		} else {
			params.delete('q')
		}
		setSearchParams(params)
	}
	
	return (
		<div className="mb-6">
			<h3 className="text-lg font-semibold mb-3">Search Cache Entries</h3>
			<div className="flex gap-2">
				<input
					type="text"
					placeholder="Search by key or cache name..."
					defaultValue={filterQuery}
					onChange={(e) => handleSearch(e.target.value)}
					className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				{filterQuery && (
					<IconButton 
						onClick={() => handleSearch('')}
						title="Clear search"
					>
						<Icon name="Close" className="w-4 h-4" />
					</IconButton>
				)}
			</div>
		</div>
	)
}

function UpdateEntryDialog({ 
	workshopId, 
	cacheName, 
	filename, 
	currentValue, 
	children 
}: {
	workshopId: string
	cacheName: string
	filename: string
	currentValue: any
	children: React.ReactNode
}) {
	const fetcher = useFetcher<typeof action>()
	const [newValue, setNewValue] = useState(JSON.stringify(currentValue, null, 2))
	const [isOpen, setIsOpen] = useState(false)
	
	const handleSubmit = () => {
		void fetcher.submit({
			intent: 'update-entry',
			workshopId,
			cacheName,
			filename,
			newValue
		}, { method: 'POST' })
		setIsOpen(false)
	}
	
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="max-w-2xl bg-popover border border-border">
				<DialogHeader>
					<DialogTitle className="text-popover-foreground">Update Cache Entry</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						Edit the JSON value for cache entry: {filename}
					</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					<textarea
						value={newValue}
						onChange={(e) => setNewValue(e.target.value)}
						className="w-full h-64 p-3 font-mono text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						placeholder="Enter JSON value..."
					/>
				</div>
				<DialogFooter>
					<Button varient="mono" onClick={() => setIsOpen(false)}>
						Cancel
					</Button>
					<Button 
						varient="primary" 
						onClick={handleSubmit}
						disabled={fetcher.state !== 'idle'}
					>
						{fetcher.state !== 'idle' ? 'Updating...' : 'Update'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function DeleteConfirmDialog({ 
	onConfirm, 
	title, 
	description, 
	children 
}: {
	onConfirm: () => void
	title: string
	description: string
	children: React.ReactNode
}) {
	const [isOpen, setIsOpen] = useState(false)
	
	const handleConfirm = () => {
		onConfirm()
		setIsOpen(false)
	}
	
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="bg-popover border border-border">
				<DialogHeader>
					<DialogTitle className="text-popover-foreground">{title}</DialogTitle>
					<DialogDescription className="text-muted-foreground">{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button varient="mono" onClick={() => setIsOpen(false)}>
						Cancel
					</Button>
					<Button varient="primary" onClick={handleConfirm}>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default function CacheManagement({ loaderData }: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>()
	
	const deleteEntry = (workshopId: string, cacheName: string, filename: string) => {
		void fetcher.submit({
			intent: 'delete-entry',
			workshopId,
			cacheName,
			filename
		}, { method: 'POST' })
	}
	
	const deleteCache = (workshopId: string, cacheName: string) => {
		void fetcher.submit({
			intent: 'delete-cache',
			workshopId,
			cacheName
		}, { method: 'POST' })
	}
	
	const deleteWorkshopCache = (workshopId: string) => {
		void fetcher.submit({
			intent: 'delete-workshop-cache',
			workshopId
		}, { method: 'POST' })
	}
	
	const { 
		currentWorkshopId, 
		filteredCaches, 
		filterQuery, 
		selectedWorkshops, 
		availableWorkshops 
	} = loaderData
	
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold mb-2">Cache Management</h2>
				<p className="text-muted-foreground">
					Current Workshop: <span className="font-semibold text-foreground">{currentWorkshopId}</span>
				</p>
			</div>
			
			<WorkshopChooser 
				selectedWorkshops={selectedWorkshops}
				availableWorkshops={availableWorkshops}
				currentWorkshopId={currentWorkshopId}
			/>
			
			<SearchFilter filterQuery={filterQuery} />
			
			{fetcher.data?.status === 'success' && (
				<div className="p-4 bg-accent text-accent-foreground rounded border border-border">
					{fetcher.data.message}
				</div>
			)}
			
			{fetcher.data?.status === 'error' && (
				<div className="p-4 bg-destructive text-destructive-foreground rounded border border-border">
					{fetcher.data.error}
				</div>
			)}
			
			{filteredCaches.length === 0 && (
				<div className="text-center py-8 text-muted-foreground">
					No caches found matching your criteria.
				</div>
			)}
			
			<div className="space-y-6">
				{filteredCaches.map((workshopCache) => (
					<div key={workshopCache.workshopId} className="border border-border rounded-lg p-4 bg-card">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-semibold flex items-center gap-2 text-card-foreground">
								<Icon name="Files" className="w-5 h-5" />
								{workshopCache.workshopId}
								{workshopCache.workshopId === currentWorkshopId && (
									<span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
										Current
									</span>
								)}
							</h3>
							<DeleteConfirmDialog
								title="Delete Workshop Cache"
								description={`Are you sure you want to delete all caches for workshop "${workshopCache.workshopId}"? This action cannot be undone.`}
								onConfirm={() => deleteWorkshopCache(workshopCache.workshopId)}
							>
								<IconButton className="text-destructive hover:bg-destructive hover:text-destructive-foreground">
									<Icon name="Remove" className="w-4 h-4" />
								</IconButton>
							</DeleteConfirmDialog>
						</div>
						
						<div className="space-y-4">
							{workshopCache.caches.map((cache) => (
								<div key={cache.name} className="bg-muted rounded-md p-3">
									<div className="flex items-center justify-between mb-3">
										<h4 className="font-medium flex items-center gap-2 text-muted-foreground">
											<Icon name="Files" className="w-4 h-4" />
											{cache.name} 
											<span className="text-sm">
												({cache.entries.length} entries)
											</span>
										</h4>
										<DeleteConfirmDialog
											title="Delete Cache"
											description={`Are you sure you want to delete the "${cache.name}" cache? This action cannot be undone.`}
											onConfirm={() => deleteCache(workshopCache.workshopId, cache.name)}
										>
											<IconButton className="text-destructive hover:bg-destructive hover:text-destructive-foreground">
												<Icon name="Remove" className="w-4 h-4" />
											</IconButton>
										</DeleteConfirmDialog>
									</div>
									
									{cache.entries.length === 0 && (
										<p className="text-muted-foreground text-sm">No entries match your search.</p>
									)}
									
									<div className="space-y-2">
										{cache.entries.map(({ key, entry, filename }) => (
											<div key={key} className="bg-background border border-border rounded p-3">
												<div className="flex items-start justify-between">
													<div className="flex-1 min-w-0">
														<div className="font-mono text-sm font-medium mb-1 truncate" title={key}>{key}</div>
														<div className="text-xs text-muted-foreground">
															Created: {new Date(entry.metadata.createdTime).toLocaleString()}
														</div>
													</div>
													<div className="flex gap-1 ml-4 flex-shrink-0">
														<a
															href={href('/admin/cache/*', {
																'*': `${workshopCache.workshopId}/${cache.name}/${filename}`,
															})}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex items-center justify-center w-8 h-8 rounded border border-border bg-background text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
															title="View JSON"
														>
															<Icon name="ExternalLink" className="w-4 h-4" />
														</a>
														<UpdateEntryDialog
															workshopId={workshopCache.workshopId}
															cacheName={cache.name}
															filename={filename}
															currentValue={entry.value}
														>
															<IconButton title="Edit value">
																<Icon name="Question" className="w-4 h-4" />
															</IconButton>
														</UpdateEntryDialog>
														<DeleteConfirmDialog
															title="Delete Cache Entry"
															description={`Are you sure you want to delete the cache entry "${key}"? This action cannot be undone.`}
															onConfirm={() => deleteEntry(workshopCache.workshopId, cache.name, filename)}
														>
															<IconButton 
																className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
																title="Delete entry"
															>
																<Icon name="Remove" className="w-4 h-4" />
															</IconButton>
														</DeleteConfirmDialog>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
