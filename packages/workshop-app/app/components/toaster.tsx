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
					classNames: { description: 'whitespace-pre-line' },
				}}
			/>
			{toast ? <ShowToast toast={toast} /> : null}
		</>
	)
}

function ToastDescription({
	description,
	details,
	onToggle,
}: {
	description: string
	details?: string
	onToggle?: () => void
}) {
	if (!details) return description
	return (
		<div>
			<div className="whitespace-pre-line">{description}</div>
			<details className="mt-2" onToggle={onToggle}>
				<summary className="cursor-pointer font-medium">More details</summary>
				<div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line">
					{details}
				</div>
			</details>
		</div>
	)
}

function ShowToast({ toast }: { toast: Toast }) {
	const { id, type, title, description, details } = toast
	useEffect(() => {
		function show() {
			showToast[type](title, {
				id,
				description: (
					<ToastDescription
						description={description}
						details={details}
						// re-issuing the toast changes the description element reference
						// which makes sonner re-measure the toast height after the
						// details element expands/collapses
						onToggle={show}
					/>
				),
				// give folks time to read (and act on) error messages
				duration: type === 'error' ? Infinity : undefined,
			})
		}
		setTimeout(show, 0)
	}, [description, details, id, title, type])
	return null
}
