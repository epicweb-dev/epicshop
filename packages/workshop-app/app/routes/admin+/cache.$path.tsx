import { getAllFileCacheEntries } from '@epic-web/workshop-utils/cache.server'
import { 
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { data, Link } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { ensureUndeployed } from '#app/utils/misc.js'
import { type Route } from './+types/cache.$path.tsx'

export async function loader({ params }: Route.LoaderArgs) {
	const timings = makeTimings('cache entry loader')
	ensureUndeployed()
	
	const path = decodeURIComponent(params.path)
	const allEntries = await getAllFileCacheEntries()
	
	const content = allEntries[path]
	
	if (content === undefined) {
		throw new Response('Cache entry not found', { status: 404 })
	}
	
	return data(
		{
			path,
			content,
		},
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
				'Content-Type': 'application/json',
			},
		},
	)
}

export default function CacheEntry({ loaderData }: Route.ComponentProps) {
	const { path, content } = loaderData
	
	const jsonString = JSON.stringify(content, null, 2)
	
	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(jsonString)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}
	
	return (
		<div className="container mx-auto">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<Link 
						to="/admin/cache" 
						className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-2"
					>
						<Icon name="ArrowLeft" className="h-4 w-4" />
						Back to Cache Management
					</Link>
					<h1 className="text-3xl font-bold">Cache Entry</h1>
					<p className="text-gray-600 font-mono text-sm mt-1">{path}</p>
				</div>
				
				<button
					onClick={copyToClipboard}
					className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				>
					<Icon name="Files" className="h-4 w-4" />
					Copy JSON
				</button>
			</div>
			
			<div className="rounded border border-gray-200 bg-white shadow-sm">
				<div className="border-b border-gray-100 p-4">
					<h2 className="font-medium text-gray-900">JSON Content</h2>
					<p className="text-sm text-gray-500">
						Type: {typeof content} 
						{Array.isArray(content) && ` (${content.length} items)`}
					</p>
				</div>
				<div className="p-4">
					<pre className="overflow-auto rounded bg-gray-50 p-4 text-sm">
						<code>{jsonString}</code>
					</pre>
				</div>
			</div>
		</div>
	)
}