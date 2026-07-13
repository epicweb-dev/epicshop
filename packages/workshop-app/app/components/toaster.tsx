import { useEffect } from 'react'
import { Toaster, toast as showToast } from 'sonner'
import { type Toast } from '#app/utils/toast.server.ts'

export function EpicToaster({ toast }: { toast?: Toast | null }) {
	return (
		<>
			<Toaster
				closeButton
				position="top-center"
				toastOptions={{
					classNames: {
						description: 'whitespace-pre-line max-h-72 overflow-y-auto',
					},
				}}
			/>
			{toast ? <ShowToast toast={toast} /> : null}
		</>
	)
}

function ShowToast({ toast }: { toast: Toast }) {
	const { id, type, title, description } = toast
	useEffect(() => {
		setTimeout(() => {
			showToast[type](title, {
				id,
				description,
				// give folks time to read (and act on) error messages
				duration: type === 'error' ? Infinity : undefined,
			})
		}, 0)
	}, [description, id, title, type])
	return null
}
