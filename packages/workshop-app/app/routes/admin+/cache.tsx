import { 
	getAllWorkshopCaches, 
	deleteCacheEntry, 
	deleteWorkshopCache, 
	updateCacheEntry 
} from '@epic-web/workshop-utils/cache.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import { Form, href, useFetcher, useSearchParams } from 'react-router'
import { z } from 'zod'
import { ensureUndeployed } from '#app/utils/misc.js'
import { type Route } from './+types/cache.ts'
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
import * as Select from '@radix-ui/react-select'
import { useState } from 'react'

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
					className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
				{filterQuery && (
					<Button 
						varient="mono" 
						onClick={() => handleSearch('')}
						title="Clear search"
					>
						<Icon name="Close" />
					</Button>
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
		fetcher.submit({
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
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Update Cache Entry</DialogTitle>
					<DialogDescription>
						Edit the JSON value for cache entry: {filename}
					</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					<textarea
						value={newValue}
						onChange={(e) => setNewValue(e.target.value)}
						className="w-full h-64 p-3 font-mono text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
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
		fetcher.submit({
			intent: 'delete-entry',
			workshopId,
			cacheName,
			filename
		}, { method: 'POST' })
	}
	
	const deleteCache = (workshopId: string, cacheName: string) => {
		fetcher.submit({
			intent: 'delete-cache',
			workshopId,
			cacheName
		}, { method: 'POST' })
	}
	
	const deleteWorkshopCache = (workshopId: string) => {
		fetcher.submit({
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
				<p className="text-gray-600">
					Current Workshop: <span className="font-semibold">{currentWorkshopId}</span>
				</p>
			</div>
			
			<WorkshopChooser 
				selectedWorkshops={selectedWorkshops}
				availableWorkshops={availableWorkshops}
				currentWorkshopId={currentWorkshopId}
			/>
			
			<SearchFilter filterQuery={filterQuery} />
			
			{fetcher.data?.status === 'success' && (
				<div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
					{fetcher.data.message}
				</div>
			)}
			
			{fetcher.data?.status === 'error' && (
				<div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
					{fetcher.data.error}
				</div>
			)}
			
			{filteredCaches.length === 0 && (
				<div className="text-center py-8 text-gray-500">
					No caches found matching your criteria.
				</div>
			)}
			
			<div className="space-y-6">
				{filteredCaches.map((workshopCache) => (
					<div key={workshopCache.workshopId} className="border border-gray-200 rounded-lg p-4">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								<Icon name="Files" className="w-5 h-5" />
								{workshopCache.workshopId}
								{workshopCache.workshopId === currentWorkshopId && (
									<span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
										Current
									</span>
								)}
							</h3>
							<DeleteConfirmDialog
								title="Delete Workshop Cache"
								description={`Are you sure you want to delete all caches for workshop "${workshopCache.workshopId}"? This action cannot be undone.`}
								onConfirm={() => deleteWorkshopCache(workshopCache.workshopId)}
							>
								<Button varient="mono" className="text-red-600 hover:text-red-800">
									<Icon name="Remove" className="w-4 h-4" />
									Delete All
								</Button>
							</DeleteConfirmDialog>
						</div>
						
						<div className="space-y-4">
							{workshopCache.caches.map((cache) => (
								<div key={cache.name} className="bg-gray-50 rounded-md p-3">
									<div className="flex items-center justify-between mb-3">
										<h4 className="font-medium flex items-center gap-2">
											<Icon name="Files" className="w-4 h-4" />
											{cache.name} 
											<span className="text-sm text-gray-500">
												({cache.entries.length} entries)
											</span>
										</h4>
										<DeleteConfirmDialog
											title="Delete Cache"
											description={`Are you sure you want to delete the "${cache.name}" cache? This action cannot be undone.`}
											onConfirm={() => deleteCache(workshopCache.workshopId, cache.name)}
										>
											<Button varient="mono" className="text-red-600 hover:text-red-800 text-sm">
												<Icon name="Remove" className="w-3 h-3" />
												Delete Cache
											</Button>
										</DeleteConfirmDialog>
									</div>
									
									{cache.entries.length === 0 && (
										<p className="text-gray-500 text-sm">No entries match your search.</p>
									)}
									
									<div className="space-y-2">
										{cache.entries.map(({ key, entry, filename }) => (
											<div key={key} className="bg-white border border-gray-200 rounded p-3">
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="font-mono text-sm font-medium mb-1">{key}</div>
														<div className="text-xs text-gray-500">
															Created: {new Date(entry.metadata.createdTime).toLocaleString()}
														</div>
													</div>
													<div className="flex gap-1 ml-4">
														<a
															href={href('/admin/cache/*', {
																'*': `${workshopCache.workshopId}/${cache.name}/${filename}`,
															})}
															target="_blank"
															rel="noopener noreferrer"
															className="text-blue-600 hover:text-blue-800 text-sm px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
														>
															<Icon name="ExternalLink" className="w-3 h-3" />
														</a>
														<UpdateEntryDialog
															workshopId={workshopCache.workshopId}
															cacheName={cache.name}
															filename={filename}
															currentValue={entry.value}
														>
															<Button varient="mono" className="text-sm">
																<Icon name="Question" className="w-3 h-3" />
															</Button>
														</UpdateEntryDialog>
														<DeleteConfirmDialog
															title="Delete Cache Entry"
															description={`Are you sure you want to delete the cache entry "${key}"? This action cannot be undone.`}
															onConfirm={() => deleteEntry(workshopCache.workshopId, cache.name, filename)}
														>
															<Button varient="mono" className="text-red-600 hover:text-red-800 text-sm">
																<Icon name="Remove" className="w-3 h-3" />
															</Button>
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
