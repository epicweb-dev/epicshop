import { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import Icon from './icons'
import { useLocation } from 'react-router'

const TouchedFiles = () => {
	const [files, setFiles] = useState<string | undefined>()
	const location = useLocation()
	useEffect(
		() => {
			const files = window.document.getElementById('files')?.innerHTML
			setFiles(files)
		},
		// TODO: Figure out if this is a good way to re-run the effect when route changes
		// This is needed because some exercises may not have #files
		[location],
	)

	return files ? (
		<>
			<Popover.Root>
				<Popover.Trigger asChild>
					<button
						className="flex items-center gap-1 border-r border-gray-200 px-6 py-3 font-mono text-sm uppercase"
						aria-label="Touched Files"
					>
						<Icon name="Files" />
						Files
					</button>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						className="mx-10 rounded bg-black px-10 py-8 text-white"
						sideOffset={5}
					>
						<strong className="inline-block pb-4 font-semibold uppercase">
							Touched Files
						</strong>
						{files && (
							<div id="files" dangerouslySetInnerHTML={{ __html: files }} />
						)}
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</>
	) : (
		<div />
	)
}

export default TouchedFiles
