import * as Popover from '@radix-ui/react-popover'
import Icon from './icons'

export const touchedFilesButton = (
	<button
		className="flex h-full items-center gap-1 border-r border-gray-200 px-6 py-3 font-mono text-sm uppercase"
		aria-label="Touched Files"
	>
		<Icon name="Files" />
		Files
	</button>
)

function TouchedFiles({ children }: { children: React.ReactElement }) {
	return (
		<>
			<Popover.Root>
				<Popover.Trigger asChild>{touchedFilesButton}</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						className="mx-10 rounded bg-black px-10 py-8 text-white"
						sideOffset={5}
					>
						<strong className="inline-block pb-4 font-semibold uppercase">
							Touched Files
						</strong>
						{children}
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</>
	)
}

export default TouchedFiles
