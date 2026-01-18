import * as React from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from './ui/dialog'

interface KeyboardShortcut {
	keys: string[]
	description: string
}

interface ShortcutCategory {
	title: string
	shortcuts: KeyboardShortcut[]
}

const shortcutCategories: ShortcutCategory[] = [
	{
		title: 'Navigation',
		shortcuts: [
			{ keys: ['g', 'h'], description: 'Go to home' },
			{
				keys: ['g', '1-9'],
				description: 'Go to exercise (e.g., g+1 → /exercise/01)',
			},
			{
				keys: ['g', '1-9', '.', '1-9'],
				description:
					'Go to exercise step (e.g., g+1+.+2 → /exercise/01/02/problem)',
			},
			{
				keys: ['g', '1-9', '.', 'f'],
				description:
					'Go to exercise finished page (e.g., g+1+.+f → /exercise/01/finished)',
			},
			{ keys: ['g', 'p'], description: 'Go to previous step/page' },
			{ keys: ['g', 'n'], description: 'Go to next step/page' },
			{ keys: ['g', 'a'], description: 'Go to account page' },
			{ keys: ['g', 'd'], description: 'Go to admin page' },
			{ keys: ['g', 'l'], description: 'Go to last exercise solution' },
			{ keys: ['Escape'], description: 'Close sidebar navigation (when open)' },
		],
	},
	{
		title: 'Playback Controls',
		shortcuts: [
			{ keys: ['Space', 'k'], description: 'Play/pause video' },
			{ keys: ['j'], description: 'Seek backward 10 seconds' },
			{ keys: ['l'], description: 'Seek forward 10 seconds' },
			{ keys: ['←'], description: 'Seek backward 10 seconds' },
			{ keys: ['→'], description: 'Seek forward 10 seconds' },
		],
	},
	{
		title: 'Frame-by-Frame Navigation',
		shortcuts: [
			{ keys: [','], description: 'Go to previous frame (when paused)' },
			{ keys: ['.'], description: 'Go to next frame (when paused)' },
		],
	},
	{
		title: 'Volume Control',
		shortcuts: [
			{ keys: ['↑'], description: 'Increase volume by 10%' },
			{ keys: ['↓'], description: 'Decrease volume by 10%' },
		],
	},
	{
		title: 'Playback Speed',
		shortcuts: [
			{ keys: ['Shift', '>'], description: 'Increase playback speed' },
			{ keys: ['Shift', '<'], description: 'Decrease playback speed' },
		],
	},
	{
		title: 'Fullscreen and Picture-in-Picture',
		shortcuts: [
			{ keys: ['f'], description: 'Toggle fullscreen mode' },
			{ keys: ['i'], description: 'Toggle picture-in-picture mode' },
		],
	},
	{
		title: 'Captions',
		shortcuts: [{ keys: ['c'], description: 'Toggle captions/subtitles' }],
	},
	{
		title: 'Quick Seek',
		shortcuts: [
			{
				keys: ['0-9'],
				description:
					'Seek to percentage of video (0 = 0%, 1 = 10%, ..., 9 = 90%)',
			},
		],
	},
]

function KeyboardShortcutsDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
					<DialogDescription>
						Use these keyboard shortcuts to navigate and control the video
						player. Press{' '}
						<kbd className="border-border bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">
							?
						</kbd>{' '}
						or select the question mark icon in the navigation to open this
						list.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-6">
					{shortcutCategories.map((category) => (
						<div key={category.title}>
							<h3 className="text-foreground mb-3 text-sm font-semibold">
								{category.title}
							</h3>
							<div className="space-y-2">
								{category.shortcuts.map((shortcut, index) => (
									<div
										key={index}
										className="flex items-center justify-between gap-4"
									>
										<span className="text-muted-foreground flex-1 text-sm">
											{shortcut.description}
										</span>
										<div className="flex shrink-0 items-center gap-1">
											{shortcut.keys.map((key, keyIndex) => (
												<React.Fragment key={keyIndex}>
													<kbd className="border-border bg-muted rounded border px-2 py-1 font-mono text-xs">
														{key}
													</kbd>
													{keyIndex < shortcut.keys.length - 1 && (
														<span className="text-muted-foreground">+</span>
													)}
												</React.Fragment>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
				<div className="border-border mt-4 border-t pt-4">
					<p className="text-muted-foreground text-xs">
						<strong>Note:</strong> Shortcuts are ignored when focus is on
						interactive elements (inputs, buttons, etc.). Press{' '}
						<kbd className="border-border bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">
							?
						</kbd>{' '}
						to toggle this dialog.
					</p>
				</div>
			</DialogContent>
		</Dialog>
	)
}

export { KeyboardShortcutsDialog }
