import { spawn } from 'child_process'
import {
	checkForUpdates,
	updateLocalRepo,
} from '@epic-web/workshop-utils/git.server'
import { json } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

export async function action() {
	const updates = await checkForUpdates()
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

export function UpdateToast({
	repoUpdates,
}: {
	repoUpdates: Awaited<ReturnType<typeof checkForUpdates>>
}) {
	const updateFetcher = useFetcher<typeof action>()
	const updateFetcherRef = useRef(updateFetcher)
	const { updatesAvailable, diffLink } = repoUpdates

	useEffect(() => {
		if (updatesAvailable) {
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
				action: {
					label: 'Update',
					onClick: () => {
						updateFetcherRef.current.submit(null, {
							method: 'post',
							action: '/admin/update-repo',
						})
					},
				},
			})
		}
	}, [updatesAvailable, diffLink])

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
