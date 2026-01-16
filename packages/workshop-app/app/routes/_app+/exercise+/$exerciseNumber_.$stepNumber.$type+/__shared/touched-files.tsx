import * as Popover from '@radix-ui/react-popover'
import * as React from 'react'
import { Await, Link, useLoaderData } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import {
	OnboardingBadge,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.tsx'
import { type Route as LayoutRoute } from '../+types/_layout.tsx'

function TouchedFiles({
	diffFilesPromise,
}: {
	diffFilesPromise: LayoutRoute.ComponentProps['loaderData']['diffFiles']
}) {
	const data = useLoaderData<LayoutRoute.ComponentProps['loaderData']>()
	const [showFilesBadge, dismissFilesBadge] =
		useOnboardingIndicator('files-popover')

	const [open, setOpen] = React.useState(false)
	const contentRef = React.useRef<HTMLDivElement>(null)

	function handleOpenChange(isOpen: boolean) {
		setOpen(isOpen)
		// Mark as complete when opening the popover for the first time
		if (isOpen) {
			dismissFilesBadge()
		}
	}

	function handleLaunchUpdate() {
		setOpen(false)
	}

	const appName = data.playground?.appName

	return (
		<>
			<Popover.Root open={open} onOpenChange={handleOpenChange}>
				<Popover.Trigger asChild>
					<button
						className="relative flex h-full items-center gap-1 border-r px-6 py-3 font-mono text-sm uppercase"
						aria-label="Relevant Files"
					>
						<Icon name="Files" />
						<span className="hidden @min-[640px]:inline">Files</span>
						{showFilesBadge ? (
							<OnboardingBadge tooltip="Click to see which files to edit!" />
						) : null}
					</button>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						ref={contentRef}
						className="slideRightContent lg:slideUpContent invert-theme bg-background text-foreground z-10 rounded px-9 py-8 select-none"
						align="start"
						sideOffset={5}
					>
						<div className="launch-editor-wrapper">
							<strong className="inline-block px-2 pb-2 font-semibold uppercase">
								Relevant Files
							</strong>
							<p className="text-muted-foreground mb-4 max-w-2xs px-2 text-sm">
								These are the files you'll need to modify for this exercise.
								Click any file to open it directly in your editor at the right
								location.{' '}
								<Link
									to="/guide#file-links"
									className="text-highlight underline"
									onClick={() => setOpen(false)}
								>
									Learn more →
								</Link>
							</p>
							{data.problem &&
							data.playground?.appName !== data.problem.name ? (
								<div className="mb-2 rounded p-1 font-mono font-medium">
									<SetAppToPlayground appName={data.problem.name} />
								</div>
							) : null}
							<div id="files">
								<React.Suspense
									fallback={
										<SimpleTooltip content="Loading diff">
											<div className="flex justify-center">
												<Icon name="Refresh" className="h-8 w-8 animate-spin" />
											</div>
										</SimpleTooltip>
									}
								>
									<Await
										resolve={diffFilesPromise}
										errorElement={
											<div className="text-foreground-destructive">
												Something went wrong.
											</div>
										}
									>
										{(diffFiles) => {
											if (!diffFiles) {
												return (
													<p className="text-foreground-destructive">
														Unable to determine diff
													</p>
												)
											}
											if (typeof diffFiles === 'string') {
												return (
													<p className="text-foreground-destructive">
														{diffFiles}
													</p>
												)
											}
											if (!diffFiles.length) {
												return <p>No files changed</p>
											}

											const props =
												appName || ENV.EPICSHOP_GITHUB_ROOT
													? {}
													: {
															title:
																"You must 'Set to Playground' before opening a file",
															className: 'not-allowed',
														}
											return (
												<ul {...props}>
													{diffFiles.length > 1 && !ENV.EPICSHOP_DEPLOYED ? (
														<div className="border-opacity-50 mb-2 border-b border-b-gray-50 pb-2 font-sans">
															<LaunchEditor
																appFile={diffFiles.map(
																	(file) => `${file.path},${file.line},1`,
																)}
																appName="playground"
																onUpdate={handleLaunchUpdate}
															>
																<p>Open All Files</p>
															</LaunchEditor>
														</div>
													) : null}
													{diffFiles.map((file) => (
														<li key={file.path} data-state={file.status}>
															<LaunchEditor
																appFile={`${file.path},${file.line},1`}
																appName={
																	ENV.EPICSHOP_DEPLOYED
																		? (data.problem?.name ?? 'playground')
																		: 'playground'
																}
																onUpdate={handleLaunchUpdate}
															>
																<code>{file.path}</code>
															</LaunchEditor>
														</li>
													))}
												</ul>
											)
										}}
									</Await>
								</React.Suspense>
							</div>
						</div>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</>
	)
}

export default TouchedFiles
