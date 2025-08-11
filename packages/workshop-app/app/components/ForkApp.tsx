import { useState } from 'react'
import { useFetcher } from 'react-router'
import { Icon } from '#app/components/icons.tsx'

interface ForkAppProps {
	appName: string
	appTitle: string
	className?: string
}

export function ForkApp({ appName, appTitle, className = '' }: ForkAppProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [newAppName, setNewAppName] = useState('')
	const fetcher = useFetcher()
	const isSubmitting = fetcher.state === 'submitting'

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!newAppName.trim()) return

		const formData = new FormData()
		formData.append('newAppName', newAppName.trim())
		
		fetcher.submit(formData, {
			method: 'post',
			action: `/app/${appName}/api/fork`,
		})
	}

	const handleSuccess = () => {
		setIsOpen(false)
		setNewAppName('')
		// Optionally redirect to the new app or show a success message
		if (fetcher.data?.forkedApp?.pathname) {
			window.location.href = fetcher.data.forkedApp.pathname
		}
	}

	// Handle successful fork
	if (fetcher.data?.success && !isSubmitting) {
		handleSuccess()
	}

	return (
		<div className={className}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
				title="Fork this app to create a copy"
			>
				<Icon name="GitBranch" className="h-4 w-4" />
				Fork App
			</button>

			{isOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
					<div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
						<div className="mb-4">
							<h3 className="text-lg font-medium text-gray-900">
								Fork "{appTitle}"
							</h3>
							<p className="mt-1 text-sm text-gray-500">
								Create a copy of this app with a new name. This will create a completely
								independent copy that you can modify without affecting the original.
							</p>
						</div>

						<fetcher.Form onSubmit={handleSubmit} className="space-y-4">
							<div>
								<label
									htmlFor="newAppName"
									className="block text-sm font-medium text-gray-700"
								>
									New App Name
								</label>
								<input
									type="text"
									id="newAppName"
									value={newAppName}
									onChange={(e) => setNewAppName(e.target.value)}
									className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
									placeholder="Enter new app name"
									required
									autoFocus
								/>
							</div>

							{fetcher.data?.error && (
								<div className="rounded-md bg-red-50 p-3">
									<div className="text-sm text-red-700">
										{fetcher.data.error}
									</div>
								</div>
							)}

							<div className="flex justify-end gap-3">
								<button
									type="button"
									onClick={() => setIsOpen(false)}
									className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={isSubmitting || !newAppName.trim()}
									className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{isSubmitting ? 'Forking...' : 'Fork App'}
								</button>
							</div>
						</fetcher.Form>
					</div>
				</div>
			)}
		</div>
	)
}