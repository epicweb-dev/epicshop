import { spawn } from 'child_process'
import { muteNotification } from '@epic-web/workshop-utils/db.server'
import {
	checkForUpdatesCached,
	updateLocalRepo,
} from '@epic-web/workshop-utils/git.server'
import { json } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

export async function action({ request }: { request: Request }) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	const id = formData.get('id')

	if (intent === 'dismiss' && typeof id === 'string') {
		await muteNotification(`update-repo-${id}`)
		return json({ type: 'dismissed' } as const)
	}

	if (intent === 'update' && typeof id === 'string') {
		const updates = await checkForUpdatesCached()
		if (!updates.updatesAvailable) {
			return json({ type: 'error', error: 'No updates available' } as const, {
				status: 400,
			})
		}

		await updateLocalRepo()

		// restart the server
		spawn(process.argv[0]!, process.argv.slice(1), {
			detached: true,
			stdio: 'inherit',
			env: {
				...process.env,
				EPICSHOP_SLOW_START: 'true',
			},
		})

		setTimeout(() => {
			console.log('exiting the old server process')
			process.exit(0)
		}, 200)

		return json({ type: 'success' } as const)
	}

	throw json({ type: 'error', error: 'Invalid intent' } as const, {
		status: 400,
	})
}

export function UpdateToast({
	repoUpdates,
}: {
	repoUpdates: Awaited<ReturnType<typeof checkForUpdatesCached>>
}) {
	const updateFetcher = useFetcher<typeof action>()
	const updateFetcherRef = useRef(updateFetcher)
	const dismissFetcher = useFetcher<typeof action>()
	const dismissFetcherRef = useRef(dismissFetcher)
	const { updatesAvailable, diffLink, remoteCommit } = repoUpdates

	useEffect(() => {
		if (updatesAvailable && remoteCommit) {
			toast.info('New workshop updates available', {
				duration: Infinity,
				description: (
					<div>
						{`Get the latest updates by clicking the update button. `}
						{diffLink ? (
							<a
								href={diffLink}
								target="_blank"
								rel="noreferrer"
								className="text-xs underline"
							>
								View changes
							</a>
						) : null}
					</div>
				),
				onDismiss: () => {
					const formData = new FormData()
					formData.append('intent', 'dismiss')
					formData.append('id', remoteCommit)
					dismissFetcherRef.current.submit(formData, {
						method: 'post',
						action: '/admin/update-repo',
					})
				},
				action: {
					label: 'Update',
					onClick: () => {
						const formData = new FormData()
						formData.append('intent', 'update')
						formData.append('id', remoteCommit)
						updateFetcherRef.current.submit(formData, {
							method: 'post',
							action: '/admin/update-repo',
						})
					},
				},
			})
		}
	}, [updatesAvailable, diffLink, remoteCommit])

	const fetcherResponse = updateFetcher.data
	useEffect(() => {
		if (!fetcherResponse) return
		if (fetcherResponse.type === 'error') {
			toast.error('Failed to update workshop', {
				description: fetcherResponse.error,
			})
		} else if (fetcherResponse.type === 'success') {
			toast.success('Workshop updated', {
				description: 'Refreshing the page in 5 seconds...',
				action: {
					label: 'Refresh now',
					onClick: () => {
						window.location.reload()
					},
				},
			})
			setTimeout(() => {
				window.location.reload()
			}, 5000)
		} else {
			toast.error('Failed to update workshop', {
				description: 'Unknown error',
			})
		}
	}, [fetcherResponse])

	return null
}
