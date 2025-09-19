import { 
	getAllFileCacheEntries,
	getCacheEntriesGroupedByWorkshop,
	deleteCache,
	deleteCacheEntry,
	updateCacheEntryByKey,
} from '@epic-web/workshop-utils/cache.server'
import { 
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import * as React from 'react'
import { data, Form, Link, useNavigation, useSearchParams } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { ensureUndeployed } from '#app/utils/misc.js'
import { type Route } from './+types/cache.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('cache loader')
	ensureUndeployed()
	
	const url = new URL(request.url)
	const workshopFilters = url.searchParams.getAll('workshop')
	const searchQuery = url.searchParams.get('q') || ''
	
	const [groupedCaches] = await Promise.all([
		getCacheEntriesGroupedByWorkshop(),
	])
	
	return data(
		{
			groupedCaches,
			workshopFilters,
			searchQuery,
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
		case 'delete-all-caches': {
			await deleteCache()
			return data({ success: true, message: 'All caches cleared successfully' })
		}
		case 'delete-cache-entry': {
			const path = formData.get('path')
			if (typeof path !== 'string') {
				throw new Response('Path is required', { status: 400 })
			}
			await deleteCacheEntry(path)
			return data({ success: true, message: `Cache entry "${path}" deleted successfully` })
		}
		case 'update-cache-entry': {
			const cacheName = formData.get('cacheName')
			const entryKey = formData.get('entryKey')
			const content = formData.get('content')
			
			if (typeof cacheName !== 'string' || typeof entryKey !== 'string' || typeof content !== 'string') {
				throw new Response('Cache name, entry key, and content are required', { status: 400 })
			}
			
			try {
				const parsedContent = JSON.parse(content)
				await updateCacheEntryByKey(cacheName, entryKey, parsedContent)
				return data({ success: true, message: `Cache entry "${entryKey}" updated successfully` })
			} catch (error) {
				if (error instanceof SyntaxError) {
					throw new Response('Invalid JSON content', { status: 400 })
				}
				throw error
			}
		}
		default: {
			throw new Response('Invalid intent', { status: 400 })
		}
	}
}

export default function CacheManagement({ loaderData }: Route.ComponentProps) {
	const { groupedCaches, workshopFilters, searchQuery } = loaderData
	const navigation = useNavigation()
	const [searchParams, setSearchParams] = useSearchParams()
	const [selectedWorkshops, setSelectedWorkshops] = React.useState(new Set(workshopFilters))
	const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery)
	
	const isSubmitting = navigation.formAction?.includes('/admin/cache')
	
	// Get all workshop paths
	const workshopPaths = React.useMemo(() => {
		return Object.keys(groupedCaches).sort()
	}, [groupedCaches])
	
	// Filter cache entries based on selected workshops and search query
	const filteredWorkshops = React.useMemo(() => {
		let filtered = Object.entries(groupedCaches)
		
		if (selectedWorkshops.size > 0 && !selectedWorkshops.has('all')) {
			filtered = filtered.filter(([workshopPath]) => selectedWorkshops.has(workshopPath))
		}
		
		if (localSearchQuery) {
			const query = localSearchQuery.toLowerCase()
			filtered = filtered.filter(([workshopPath, caches]) => {
				return workshopPath.toLowerCase().includes(query) ||
					Object.entries(caches).some(([cacheName, entries]) => {
						return cacheName.toLowerCase().includes(query) ||
							Object.entries(entries).some(([entryKey, entryValue]) => {
								return entryKey.toLowerCase().includes(query) ||
									JSON.stringify(entryValue).toLowerCase().includes(query)
							})
					})
			})
		}
		
		return Object.fromEntries(filtered)
	}, [groupedCaches, selectedWorkshops, localSearchQuery])
	
	const handleWorkshopToggle = (workshop: string) => {
		const newSelected = new Set(selectedWorkshops)
		if (workshop === 'all') {
			newSelected.clear()
			newSelected.add('all')
		} else {
			newSelected.delete('all')
			if (newSelected.has(workshop)) {
				newSelected.delete(workshop)
			} else {
				newSelected.add(workshop)
			}
			if (newSelected.size === 0) {
				newSelected.add('all')
			}
		}
		
		setSelectedWorkshops(newSelected)
		
		const newSearchParams = new URLSearchParams(searchParams)
		newSearchParams.delete('workshop')
		if (!newSelected.has('all')) {
			for (const workshop of newSelected) {
				newSearchParams.append('workshop', workshop)
			}
		}
		setSearchParams(newSearchParams)
	}
	
	const handleSearchChange = (query: string) => {
		setLocalSearchQuery(query)
		const newSearchParams = new URLSearchParams(searchParams)
		if (query) {
			newSearchParams.set('q', query)
		} else {
			newSearchParams.delete('q')
		}
		setSearchParams(newSearchParams)
	}
	
	const totalEntries = Object.values(groupedCaches).reduce((total, caches) => {
		return total + Object.values(caches).reduce((cacheTotal, entries) => {
			return cacheTotal + Object.keys(entries).length
		}, 0)
	}, 0)
	
	const filteredEntries = Object.values(filteredWorkshops).reduce((total, caches) => {
		return total + Object.values(caches).reduce((cacheTotal, entries) => {
			return cacheTotal + Object.keys(entries).length
		}, 0)
	}, 0)
	
	return (
		<div className="container mx-auto">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-3xl font-bold">Cache Management</h1>
				<Form method="POST">
					<button
						type="submit"
						name="intent"
						value="delete-all-caches"
						className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Clearing...' : 'Clear All Caches'}
					</button>
				</Form>
			</div>
			
			{/* Filters */}
			<div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start">
				<div className="flex-1">
					<label htmlFor="search" className="block text-sm font-medium mb-1">
						Search cache entries
					</label>
					<input
						id="search"
						type="text"
						value={localSearchQuery}
						onChange={(e) => handleSearchChange(e.target.value)}
						placeholder="Search by workshop, cache name, or content..."
						className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				
				<div className="min-w-64">
					<label className="block text-sm font-medium mb-1">
						Workshops (select multiple)
					</label>
					<div className="border border-gray-300 rounded p-2 bg-white max-h-40 overflow-y-auto">
						<label className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
							<input
								type="checkbox"
								checked={selectedWorkshops.has('all')}
								onChange={() => handleWorkshopToggle('all')}
								className="rounded"
							/>
							<span className="text-sm font-medium">All Workshops</span>
						</label>
						<hr className="my-2" />
						{workshopPaths.map((workshopPath) => (
							<label key={workshopPath} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
								<input
									type="checkbox"
									checked={selectedWorkshops.has(workshopPath)}
									onChange={() => handleWorkshopToggle(workshopPath)}
									className="rounded"
								/>
								<span className="text-sm">{workshopPath}</span>
							</label>
						))}
					</div>
				</div>
			</div>
			
			{/* Cache entries summary */}
			<div className="mb-4">
				<p className="text-sm text-gray-600">
					Showing {filteredEntries} of {totalEntries} cache entries across {Object.keys(filteredWorkshops).length} workshops
				</p>
			</div>
			
			{/* Workshop and cache entries list */}
			<div className="space-y-6">
				{Object.keys(filteredWorkshops).length === 0 ? (
					<div className="rounded border border-gray-200 p-8 text-center">
						<p className="text-gray-500">No cache entries found matching your criteria.</p>
					</div>
				) : (
					Object.entries(filteredWorkshops).map(([workshopPath, caches]) => (
						<WorkshopCacheSection
							key={workshopPath}
							workshopPath={workshopPath}
							caches={caches}
							isSubmitting={isSubmitting ?? false}
						/>
					))
				)}
			</div>
		</div>
	)
}

function WorkshopCacheSection({ 
	workshopPath, 
	caches, 
	isSubmitting 
}: { 
	workshopPath: string
	caches: Record<string, Record<string, any>>
	isSubmitting: boolean
}) {
	const [isWorkshopExpanded, setIsWorkshopExpanded] = React.useState(false)
	
	const totalCacheEntries = Object.values(caches).reduce((total, entries) => {
		return total + Object.keys(entries).length
	}, 0)
	
	return (
		<div className="rounded border border-gray-200 bg-white shadow-sm">
			<div className="flex items-center justify-between border-b border-gray-100 p-4 bg-gray-50">
				<div className="flex-1">
					<h2 className="font-medium text-lg text-gray-900">
						{workshopPath}
					</h2>
					<p className="text-sm text-gray-500 mt-1">
						{Object.keys(caches).length} cache types, {totalCacheEntries} total entries
					</p>
				</div>
				
				<button
					onClick={() => setIsWorkshopExpanded(!isWorkshopExpanded)}
					className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
				>
					<Icon name={isWorkshopExpanded ? "ChevronUp" : "ChevronDown"} className="h-5 w-5" />
				</button>
			</div>
			
			{isWorkshopExpanded && (
				<div className="p-4 space-y-4">
					{Object.entries(caches).map(([cacheName, entries]) => (
						<CacheTypeSection
							key={cacheName}
							cacheName={cacheName}
							entries={entries}
							isSubmitting={isSubmitting}
						/>
					))}
				</div>
			)}
		</div>
	)
}

function CacheTypeSection({ 
	cacheName, 
	entries, 
	isSubmitting 
}: { 
	cacheName: string
	entries: Record<string, any>
	isSubmitting: boolean
}) {
	const [isCacheExpanded, setIsCacheExpanded] = React.useState(false)
	
	return (
		<div className="border border-gray-200 rounded bg-gray-50">
			<div className="flex items-center justify-between p-3 border-b border-gray-200">
				<div className="flex-1">
					<h3 className="font-medium text-gray-900">
						{cacheName}
					</h3>
					<p className="text-sm text-gray-500">
						{Object.keys(entries).length} entries
					</p>
				</div>
				
				<button
					onClick={() => setIsCacheExpanded(!isCacheExpanded)}
					className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
				>
					<Icon name={isCacheExpanded ? "ChevronUp" : "ChevronDown"} className="h-4 w-4" />
				</button>
			</div>
			
			{isCacheExpanded && (
				<div className="p-3 space-y-2">
					{Object.entries(entries).map(([entryKey, entryValue]) => (
						<CacheEntryCard
							key={entryKey}
							cacheName={cacheName}
							entryKey={entryKey}
							content={entryValue}
							isSubmitting={isSubmitting}
						/>
					))}
				</div>
			)}
		</div>
	)
}

function CacheEntryCard({ 
	cacheName,
	entryKey,
	content, 
	isSubmitting 
}: { 
	cacheName: string
	entryKey: string
	content: any
	isSubmitting: boolean
}) {
	const [isExpanded, setIsExpanded] = React.useState(false)
	const [isEditing, setIsEditing] = React.useState(false)
	const [editContent, setEditContent] = React.useState('')
	
	React.useEffect(() => {
		if (isEditing) {
			setEditContent(JSON.stringify(content, null, 2))
		}
	}, [isEditing, content])
	
	const toggleExpanded = () => setIsExpanded(!isExpanded)
	const toggleEditing = () => {
		setIsEditing(!isEditing)
		if (isEditing) {
			setEditContent('')
		}
	}
	
	const displayKey = entryKey.split('/').pop() || entryKey
	
	return (
		<div className="rounded border border-gray-200 bg-white shadow-sm">
			<div className="flex items-center justify-between border-b border-gray-100 p-3">
				<div className="flex-1">
					<h4 className="font-mono text-sm font-medium text-gray-900">
						{displayKey}
					</h4>
					<p className="text-xs text-gray-500 mt-1">
						{typeof content === 'object' ? 'Object' : typeof content} 
						{Array.isArray(content) && ` (${content.length} items)`}
					</p>
				</div>
				
				<div className="flex items-center gap-1">
					<SimpleTooltip content="View Raw JSON">
						<Link
							to={`/admin/cache/${encodeURIComponent(cacheName)}/${encodeURIComponent(entryKey)}`}
							className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<Icon name="ExternalLink" className="h-3 w-3" />
						</Link>
					</SimpleTooltip>
					
					<SimpleTooltip content={isExpanded ? "Collapse" : "Expand"}>
						<button
							onClick={toggleExpanded}
							className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} className="h-3 w-3" />
						</button>
					</SimpleTooltip>
					
					<SimpleTooltip content={isEditing ? "Cancel editing" : "Edit"}>
						<button
							onClick={toggleEditing}
							className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<Icon name={isEditing ? "Close" : "Keyboard"} className="h-3 w-3" />
						</button>
					</SimpleTooltip>
					
					<Form method="POST">
						<input type="hidden" name="intent" value="delete-cache-entry" />
						<input type="hidden" name="path" value={`${cacheName}/${entryKey}`} />
						<SimpleTooltip content="Delete">
							<button
								type="submit"
								disabled={isSubmitting}
								className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
							>
								<Icon name="Remove" className="h-3 w-3" />
							</button>
						</SimpleTooltip>
					</Form>
				</div>
			</div>
			
			{(isExpanded || isEditing) && (
				<div className="p-3">
					{isEditing ? (
						<div className="space-y-3">
							<textarea
								value={editContent}
								onChange={(e) => setEditContent(e.target.value)}
								rows={8}
								className="w-full rounded border border-gray-300 p-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
							<div className="flex justify-end gap-2">
								<button
									onClick={toggleEditing}
									className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
								>
									Cancel
								</button>
								<Form method="POST">
									<input type="hidden" name="intent" value="update-cache-entry" />
									<input type="hidden" name="cacheName" value={cacheName} />
									<input type="hidden" name="entryKey" value={entryKey} />
									<input type="hidden" name="content" value={editContent} />
									<button
										type="submit"
										disabled={isSubmitting}
										className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
									>
										{isSubmitting ? 'Saving...' : 'Save Changes'}
									</button>
								</Form>
							</div>
						</div>
					) : (
						<pre className="overflow-auto rounded bg-gray-50 p-2 text-xs">
							<code>{JSON.stringify(content, null, 2)}</code>
						</pre>
					)}
				</div>
			)}
		</div>
	)
}
