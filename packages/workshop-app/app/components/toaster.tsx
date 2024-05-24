import { type Toast } from '#app/utils/toast.server.ts'
import { useEffect } from 'react'
import { Toaster, toast as showToast } from 'sonner'

export function EpicToaster({ toast }: { toast?: Toast | null }) {
	return (
		<>
			<Toaster closeButton position="top-center" />
			{toast ? <ShowToast toast={toast} /> : null}
		</>
	)
}

function ShowToast({ toast }: { toast: Toast }) {
	const { id, type, title, description } = toast
	useEffect(() => {
		setTimeout(() => {
			showToast[type](title, { id, description })
		}, 0)
	}, [description, id, title, type])
	return null
}
