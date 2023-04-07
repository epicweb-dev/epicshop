import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { LaunchEditor } from '~/routes/launch-editor'
import { useEventListener } from '~/utils/misc'
import Icon from './icons'

const TOUCHEDFILES_EVENT_NAME: keyof CustomEventMap =
	'kcdshop-launch-editor-update'

export function sendLaunchEditorUpdate(
	element: EventTargetElement,
	detail?: string,
) {
	const event = new CustomEvent(TOUCHEDFILES_EVENT_NAME, { detail })
	element?.dispatchEvent(event)
}

export const touchedFilesButton = (
	<button
		className="flex h-full items-center gap-1 border-r border-gray-200 px-6 py-3 font-mono text-sm uppercase"
		aria-label="Relevant Files"
	>
		<Icon name="Files" />
		Files
	</button>
)

function TouchedFiles({
	appName,
	children,
}: {
	appName?: string
	children: React.ReactElement
}) {
	const [open, setOpen] = React.useState(false)
	const [fileList, setFileList] = React.useState<string[]>([])
	const contentRef = React.useRef<HTMLDivElement>(null)

	const notification = React.useCallback((e: CustomEvent<string>) => {
		const setVisibility = (visible: boolean) => {
			if (contentRef.current) {
				contentRef.current.style.visibility = visible ? 'visible' : 'collapse'
			}
		}
		switch (e.detail) {
			case 'submitting': {
				setVisibility(false)
				break
			}
			case 'loading': {
				// we can close the popup once the form in the child LaunchEditor was submitted.
				// we wait another tick to prevent the warning
				// Cannot update a component (`TouchedFiles`) while rendering a different component (`LaunchEditor`)
				setTimeout(() => {
					setVisibility(true)
					setOpen(false)
				}, 0)
				break
			}
		}
	}, [])

	useEventListener(TOUCHEDFILES_EVENT_NAME, document, notification)

	function getAllFiles() {
		if (fileList.length || !appName) return
		const data = contentRef.current?.querySelectorAll('input[name="appFile"]')
		const files = Array.from(data ?? [])
			?.map(input => input.getAttribute('value') || '')
			.filter(Boolean)
		setFileList(files)
	}

	const OpenAllFiles = React.useMemo(() => {
		return appName && fileList.length > 2 ? (
			<div className="mb-2 border-b border-b-gray-50 border-opacity-50 pb-2 font-sans">
				<LaunchEditor appFile={fileList} appName={appName}>
					<p>Open All Files</p>
				</LaunchEditor>
			</div>
		) : null
	}, [appName, fileList])

	return (
		<>
			<Popover.Root
				open={open}
				onOpenChange={e => {
					setOpen(e)
					// wait until the DOM created from react children
					setTimeout(getAllFiles, 0)
				}}
			>
				<Popover.Trigger asChild>{touchedFilesButton}</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						ref={contentRef}
						className="mx-10 rounded bg-black px-9 py-8 text-white"
						sideOffset={5}
					>
						<div className="launch-editor-wrapper">
							<strong className="inline-block px-2 pb-4 font-semibold uppercase">
								Relevant Files
							</strong>
							{OpenAllFiles}
							{children}
						</div>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</>
	)
}

export default TouchedFiles
