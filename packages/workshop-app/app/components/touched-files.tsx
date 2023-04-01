import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { LaunchEditor } from '~/routes/launch-editor'
import { useEventListener } from '~/utils/misc'
import Icon from './icons'

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
	const listRef = React.useRef<HTMLDivElement>(null)

	// we can close the popup once the form in the child LaunchEditor was submitted.
	// we wait another tick to prevent the warning
	// Cannot update a component (`TouchedFiles`) while rendering a different component (`LaunchEditor`)
	const notification = React.useCallback((event: Event) => {
		setTimeout(() => {
			setOpen(false)
		}, 0)
	}, [])

	useEventListener('kcdshop-launchEditor-submitted', notification, document)

	function getAllFiles() {
		if (fileList.length || !appName) {
			return
		}

		const data = listRef.current?.querySelectorAll('input[name="appFile"]')
		const files = Array.from(data ?? [])
			?.map(input => input.getAttribute('value') || '')
			.filter(Boolean)
		setFileList(files)
	}

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
						className="mx-10 rounded bg-black px-9 py-8 text-white"
						sideOffset={5}
					>
						<strong className="inline-block px-2 pb-4 font-semibold uppercase">
							Relevant Files
						</strong>
						<div ref={listRef} className="launch-editor-wrapper">
							{appName && fileList.length > 2 ? (
								<div className="mb-2 border-b border-b-gray-50 border-opacity-50 pb-2 font-sans">
									<LaunchEditor appFile={fileList} appName={appName}>
										<p>Open All Files</p>
									</LaunchEditor>
								</div>
							) : null}
							{children}
						</div>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</>
	)
}

export default TouchedFiles
