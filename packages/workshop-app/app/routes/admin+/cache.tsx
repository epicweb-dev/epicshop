import { 
	getAllFileCacheEntries,
	getCacheEntriesGroupedByType,
	deleteCache,
	deleteCacheEntry,
	deleteCacheEntryByKey,
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
	const cacheFilters = url.searchParams.getAll('cache')
	const searchQuery = url.searchParams.get('q') || ''
	
	const [groupedCaches] = await Promise.all([
		getCacheEntriesGroupedByType(),
	])
	
	return data(
		{
			groupedCaches,
			cacheFilters,
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
			const cacheName = formData.get('cacheName')
			const entryKey = formData.get('entryKey')
			if (typeof cacheName !== 'string' || typeof entryKey !== 'string') {
				throw new Response('Cache name and entry key are required', { status: 400 })
			}
			await deleteCacheEntryByKey(cacheName, entryKey)
			return data({ success: true, message: `Cache entry "${entryKey}" deleted successfully` })
		}
		case 'update-cache-entry': {
			const cacheName = formData.get('cacheName')
			const entryKey = formData.get('entryKey')
			const content = formData.get('content')
			
			if (typeof cacheName !== 'string' || typeof entryKey !== 'string' || typeof content !== 'string') {
				throw new Response('Cache name, entry key, and content are required', { status: 400 })
			}
			
			try {
				// Validate that content is valid JSON
				JSON.parse(content)
				// Pass the string content, the function will parse it
				await updateCacheEntryByKey(cacheName, entryKey, content)
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
	const { groupedCaches, cacheFilters, searchQuery } = loaderData
	const navigation = useNavigation()
	const [searchParams, setSearchParams] = useSearchParams()
	const [selectedCaches, setSelectedCaches] = React.useState(() => {
		if (cacheFilters.length > 0) {
			return new Set(cacheFilters)
		}
		return new Set(['all'])
	})
	const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery)
	
	const isSubmitting = navigation.formAction?.includes('/admin/cache')
	
	// Get all cache names
	const cacheNames = React.useMemo(() => {
		return Object.keys(groupedCaches).sort()
	}, [groupedCaches])
	
	// Filter cache entries based on selected caches and search query
	const filteredCaches = React.useMemo(() => {
		let filtered = Object.entries(groupedCaches)
		
		if (selectedCaches.size > 0 && !selectedCaches.has('all')) {
			filtered = filtered.filter(([cacheName]) => selectedCaches.has(cacheName))
		}
		
		if (localSearchQuery) {
			const query = localSearchQuery.toLowerCase()
			filtered = filtered.filter(([cacheName, entries]) => {
				return cacheName.toLowerCase().includes(query) ||
					Object.entries(entries).some(([entryKey, entryValue]) => {
						return entryKey.toLowerCase().includes(query) ||
							JSON.stringify(entryValue).toLowerCase().includes(query)
					})
			})
		}
		
		return Object.fromEntries(filtered)
	}, [groupedCaches, selectedCaches, localSearchQuery])
	
	const handleCacheToggle = (cache: string) => {
		const newSelected = new Set(selectedCaches)
		if (cache === 'all') {
			newSelected.clear()
			newSelected.add('all')
		} else {
			newSelected.delete('all')
			if (newSelected.has(cache)) {
				newSelected.delete(cache)
			} else {
				newSelected.add(cache)
			}
			if (newSelected.size === 0) {
				newSelected.add('all')
			}
		}
		
		setSelectedCaches(newSelected)
		
		const newSearchParams = new URLSearchParams(searchParams)
		newSearchParams.delete('cache')
		if (!newSelected.has('all')) {
			for (const cache of newSelected) {
				newSearchParams.append('cache', cache)
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
	
	const totalEntries = Object.values(groupedCaches).reduce((total, entries) => {
		return total + (entries && typeof entries === 'object' ? Object.keys(entries).length : 0)
	}, 0)
	
	const filteredEntries = Object.values(filteredCaches).reduce((total, entries) => {
		return total + (entries && typeof entries === 'object' ? Object.keys(entries).length : 0)
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
						className="rounded bg-destructive px-4 py-2 text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Clearing...' : 'Clear All Caches'}
					</button>
				</Form>
			</div>
			
			{/* Filters */}
			<div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start">
				<div className="flex-1">
					<label htmlFor="search" className="block text-sm font-medium mb-1 text-foreground">
						Search cache entries
					</label>
					<input
						id="search"
						type="text"
						value={localSearchQuery}
						onChange={(e) => handleSearchChange(e.target.value)}
						placeholder="Search by cache name or content..."
						className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>
				
				<div className="min-w-64">
					<label className="block text-sm font-medium mb-1 text-foreground">
						Workshops (select multiple)
					</label>
					<div className="border border-input rounded p-2 bg-background max-h-40 overflow-y-auto">
						<label className="flex items-center gap-2 p-1 hover:bg-accent hover:text-accent-foreground cursor-pointer rounded">
							<input
								type="checkbox"
								checked={selectedCaches.has('all')}
								onChange={() => handleCacheToggle('all')}
								className="rounded border-input"
							/>
							<span className="text-sm font-medium">All Workshops</span>
						</label>
						<hr className="my-2 border-border" />
						{cacheNames.map((cacheName) => (
							<label key={cacheName} className="flex items-center gap-2 p-1 hover:bg-accent hover:text-accent-foreground cursor-pointer rounded">
								<input
									type="checkbox"
									checked={selectedCaches.has(cacheName)}
									onChange={() => handleCacheToggle(cacheName)}
									className="rounded border-input"
								/>
								<span className="text-sm">{cacheName}</span>
							</label>
						))}
					</div>
				</div>
			</div>
			
			{/* Cache entries summary */}
			<div className="mb-4">
				<p className="text-sm text-muted-foreground">
					Showing {filteredEntries} of {totalEntries} cache entries across {Object.keys(filteredCaches).length} workshops
				</p>
			</div>
			
			{/* Cache entries list */}
			<div className="space-y-6">
				{Object.keys(filteredCaches).length === 0 ? (
					<div className="rounded border border-border bg-card p-8 text-center">
						<p className="text-muted-foreground">No cache entries found matching your criteria.</p>
					</div>
				) : (
					Object.entries(filteredCaches).map(([cacheName, entries]) => (
						<CacheSection
							key={cacheName}
							cacheName={cacheName}
							entries={entries}
							isSubmitting={isSubmitting ?? false}
						/>
					))
				)}
			</div>
		</div>
	)
}

function CacheSection({ 
	cacheName, 
	entries, 
	isSubmitting 
}: { 
	cacheName: string
	entries: Record<string, any>
	isSubmitting: boolean
}) {
	const [isCacheExpanded, setIsCacheExpanded] = React.useState(false)
	const entryCount = Object.keys(entries || {}).length
	
	return (
		<div className="rounded border border-border bg-card shadow-sm">
			<div className="flex items-center justify-between border-b border-border p-4 bg-muted/50">
				<div className="flex-1">
					<h2 className="font-medium text-lg text-card-foreground">
						{cacheName}
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{entryCount} {entryCount === 1 ? 'entry' : 'entries'}
					</p>
				</div>
				
				<button
					onClick={() => setIsCacheExpanded(!isCacheExpanded)}
					className="rounded p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
				>
					<Icon name={isCacheExpanded ? "ChevronUp" : "ChevronDown"} className="h-5 w-5" />
				</button>
			</div>
			
			{isCacheExpanded && (
				<div className="p-4 space-y-2">
					{entryCount === 0 ? (
						<p className="text-muted-foreground text-center py-4">No entries in this cache</p>
					) : (
						Object.entries(entries).map(([entryKey, entryValue]) => (
							<CacheEntryCard
								key={entryKey}
								cacheName={cacheName}
								entryKey={entryKey}
								content={entryValue}
								isSubmitting={isSubmitting}
							/>
						))
					)}
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
			// Allow editing of the entry.value, not the entire structure
			const entryValue = content?.entry?.value
			setEditContent(JSON.stringify(entryValue, null, 2))
		}
	}, [isEditing, content])
	
	const toggleExpanded = () => setIsExpanded(!isExpanded)
	const toggleEditing = () => {
		setIsEditing(!isEditing)
		if (isEditing) {
			setEditContent('')
		}
	}
	
	// Extract the actual cached value from the entry structure
	const entryValue = content?.entry?.value
	const cacheKey = content?.key || entryKey
	const metadata = content?.entry?.metadata
	
	// Use the original cache key if available, otherwise use the MD5 hash
	const displayKey = cacheKey && cacheKey !== entryKey ? cacheKey : entryKey
	
	// Determine the data type description
	const getTypeDescription = (value: any) => {
		if (value === null) return 'null'
		if (value === undefined) return 'undefined'
		if (Array.isArray(value)) return `Array (${value.length} items)`
		if (typeof value === 'object') return 'Object'
		return typeof value
	}
	
	return (
		<div className="rounded border border-border bg-card shadow-sm">
			<div className="flex items-center justify-between border-b border-border p-3">
				<div className="flex-1">
					<h4 className="font-mono text-sm font-medium text-card-foreground truncate">
						{displayKey}
					</h4>
					<p className="text-xs text-muted-foreground mt-1">
						{getTypeDescription(entryValue)}
						{metadata?.createdTime && (
							<span className="ml-2">• Created {new Date(metadata.createdTime).toLocaleString()}</span>
						)}
					</p>
				</div>
				
				<div className="flex items-center gap-1">
					<SimpleTooltip content="View Raw JSON">
						<Link
							to={`/admin/cache/${encodeURIComponent(cacheName)}/${encodeURIComponent(entryKey)}`}
							className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						>
							<Icon name="ExternalLink" className="h-3 w-3" />
						</Link>
					</SimpleTooltip>
					
					<SimpleTooltip content={isExpanded ? "Collapse" : "Expand"}>
						<button
							onClick={toggleExpanded}
							className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						>
							<Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} className="h-3 w-3" />
						</button>
					</SimpleTooltip>
					
					<SimpleTooltip content={isEditing ? "Cancel editing" : "Edit"}>
						<button
							onClick={toggleEditing}
							className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						>
							<Icon name={isEditing ? "Close" : "Keyboard"} className="h-3 w-3" />
						</button>
					</SimpleTooltip>
					
					<Form method="POST">
						<input type="hidden" name="intent" value="delete-cache-entry" />
						<input type="hidden" name="cacheName" value={cacheName} />
						<input type="hidden" name="entryKey" value={entryKey} />
						<SimpleTooltip content="Delete">
							<button
								type="submit"
								disabled={isSubmitting}
								className="rounded p-1 text-foreground-destructive hover:bg-destructive/10 hover:text-destructive-foreground disabled:opacity-50"
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
								className="w-full rounded border border-input bg-background p-2 font-mono text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
							/>
							<div className="flex justify-end gap-2">
								<button
									onClick={toggleEditing}
									className="rounded border border-input bg-background px-3 py-1 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
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
										className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
									>
										{isSubmitting ? 'Saving...' : 'Save Changes'}
									</button>
								</Form>
							</div>
						</div>
					) : (
						<pre className="rounded bg-muted p-3 text-xs overflow-auto border border-border font-mono text-foreground">
							{JSON.stringify(entryValue, null, 2)}
						</pre>
					)}
				</div>
			)}
		</div>
	)
}
