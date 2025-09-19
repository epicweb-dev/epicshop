import { 
	getAllFileCacheEntries,
	deleteCache,
	deleteCacheEntry,
	updateCacheEntry,
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
	const workshopFilter = url.searchParams.get('workshop')
	const searchQuery = url.searchParams.get('q') || ''
	
	const [cacheEntries] = await Promise.all([
		getAllFileCacheEntries(),
	])
	
	return data(
		{
			cacheEntries,
			workshopFilter,
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
			const path = formData.get('path')
			const content = formData.get('content')
			
			if (typeof path !== 'string' || typeof content !== 'string') {
				throw new Response('Path and content are required', { status: 400 })
			}
			
			try {
				const parsedContent = JSON.parse(content)
				await updateCacheEntry(path, parsedContent)
				return data({ success: true, message: `Cache entry "${path}" updated successfully` })
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
	const { cacheEntries, workshopFilter, searchQuery } = loaderData
	const navigation = useNavigation()
	const [searchParams, setSearchParams] = useSearchParams()
	const [selectedWorkshop, setSelectedWorkshop] = React.useState(workshopFilter || 'all')
	const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery)
	
	const isSubmitting = navigation.formAction?.includes('/admin/cache')
	
	// Get unique workshop IDs from cache entries
	const workshopIds = React.useMemo(() => {
		const ids = new Set<string>()
		for (const [path] of Object.entries(cacheEntries)) {
			// Extract workshop ID from path structure
			const pathParts = path.split('/')
			if (pathParts.length > 0 && pathParts[0]) {
				ids.add(pathParts[0])
			}
		}
		return Array.from(ids).sort()
	}, [cacheEntries])
	
	// Filter cache entries based on selected workshop and search query
	const filteredEntries = React.useMemo(() => {
		let filtered = Object.entries(cacheEntries)
		
		if (selectedWorkshop !== 'all') {
			filtered = filtered.filter(([path]) => path.startsWith(selectedWorkshop))
		}
		
		if (localSearchQuery) {
			const query = localSearchQuery.toLowerCase()
			filtered = filtered.filter(([path, content]) => {
				return path.toLowerCase().includes(query) ||
					JSON.stringify(content).toLowerCase().includes(query)
			})
		}
		
		return filtered
	}, [cacheEntries, selectedWorkshop, localSearchQuery])
	
	const handleWorkshopChange = (workshop: string) => {
		setSelectedWorkshop(workshop)
		const newSearchParams = new URLSearchParams(searchParams)
		if (workshop === 'all') {
			newSearchParams.delete('workshop')
		} else {
			newSearchParams.set('workshop', workshop)
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
			<div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center">
				<div className="flex-1">
					<label htmlFor="search" className="block text-sm font-medium mb-1">
						Search cache entries
					</label>
					<input
						id="search"
						type="text"
						value={localSearchQuery}
						onChange={(e) => handleSearchChange(e.target.value)}
						placeholder="Search by path or content..."
						className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				
				<div className="min-w-48">
					<label htmlFor="workshop" className="block text-sm font-medium mb-1">
						Workshop
					</label>
					<select
						id="workshop"
						value={selectedWorkshop}
						onChange={(e) => handleWorkshopChange(e.target.value)}
						className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value="all">All Workshops</option>
						{workshopIds.map((workshopId) => (
							<option key={workshopId} value={workshopId}>
								{workshopId}
							</option>
						))}
					</select>
				</div>
			</div>
			
			{/* Cache entries summary */}
			<div className="mb-4">
				<p className="text-sm text-gray-600">
					Showing {filteredEntries.length} of {Object.keys(cacheEntries).length} cache entries
				</p>
			</div>
			
			{/* Cache entries list */}
			<div className="space-y-4">
				{filteredEntries.length === 0 ? (
					<div className="rounded border border-gray-200 p-8 text-center">
						<p className="text-gray-500">No cache entries found matching your criteria.</p>
					</div>
				) : (
					filteredEntries.map(([path, content]) => (
						<CacheEntryCard
							key={path}
							path={path}
							content={content}
							isSubmitting={isSubmitting ?? false}
						/>
					))
				)}
			</div>
		</div>
	)
}

function CacheEntryCard({ 
	path, 
	content, 
	isSubmitting 
}: { 
	path: string
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
	
	return (
		<div className="rounded border border-gray-200 bg-white shadow-sm">
			<div className="flex items-center justify-between border-b border-gray-100 p-4">
				<div className="flex-1">
					<h3 className="font-mono text-sm font-medium text-gray-900">
						{path}
					</h3>
					<p className="text-xs text-gray-500 mt-1">
						{typeof content === 'object' ? 'Object' : typeof content} 
						{Array.isArray(content) && ` (${content.length} items)`}
					</p>
				</div>
				
				<div className="flex items-center gap-2">
					<SimpleTooltip content="View JSON">
						<Link
							to={`/admin/cache/${encodeURIComponent(path)}`}
							className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<Icon name="ExternalLink" className="h-4 w-4" />
						</Link>
					</SimpleTooltip>
					
					<SimpleTooltip content={isExpanded ? "Collapse" : "Expand"}>
						<button
							onClick={toggleExpanded}
							className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} className="h-4 w-4" />
						</button>
					</SimpleTooltip>
					
					<SimpleTooltip content={isEditing ? "Cancel editing" : "Edit"}>
						<button
							onClick={toggleEditing}
							className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<Icon name={isEditing ? "Close" : "Keyboard"} className="h-4 w-4" />
						</button>
					</SimpleTooltip>
					
					<Form method="POST">
						<input type="hidden" name="intent" value="delete-cache-entry" />
						<input type="hidden" name="path" value={path} />
						<SimpleTooltip content="Delete">
							<button
								type="submit"
								disabled={isSubmitting}
								className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
							>
								<Icon name="Remove" className="h-4 w-4" />
							</button>
						</SimpleTooltip>
					</Form>
				</div>
			</div>
			
			{(isExpanded || isEditing) && (
				<div className="p-4">
					{isEditing ? (
						<div className="space-y-4">
							<textarea
								value={editContent}
								onChange={(e) => setEditContent(e.target.value)}
								rows={10}
								className="w-full rounded border border-gray-300 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
							<div className="flex justify-end gap-2">
								<button
									onClick={toggleEditing}
									className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
								>
									Cancel
								</button>
								<Form method="POST">
									<input type="hidden" name="intent" value="update-cache-entry" />
									<input type="hidden" name="path" value={path} />
									<input type="hidden" name="content" value={editContent} />
									<button
										type="submit"
										disabled={isSubmitting}
										className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
									>
										{isSubmitting ? 'Saving...' : 'Save Changes'}
									</button>
								</Form>
							</div>
						</div>
					) : (
						<pre className="overflow-auto rounded bg-gray-50 p-3 text-sm">
							<code>{JSON.stringify(content, null, 2)}</code>
						</pre>
					)}
				</div>
			)}
		</div>
	)
}
