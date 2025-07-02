import * as Popover from '@radix-ui/react-popover'
// type imports removed for compatibility
import { Await, useLoaderData } from 'react-router';
import * as React from 'react'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import { SetAppToPlayground } from '#app/routes/set-playground.tsx'
import { type loader } from '../_layout.tsx'

function TouchedFiles({
	diffFilesPromise,
}: {
	diffFilesPromise: any<typeof loader>['diffFiles']
}) {
	const data = useLoaderData<typeof loader>()

	const [open, setOpen] = React.useState(false)
	const contentRef = React.useRef<HTMLDivElement>(null)

	function handleLaunchUpdate() {
		setOpen(false)
	}

	const appName = data.playground?.appName

	return (
		<>
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger asChild>
					<button
						className="flex h-full items-center gap-1 border-r px-6 py-3 font-mono text-sm uppercase"
						aria-label="Relevant Files"
					>
						<Icon name="Files" />
						Files
					</button>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						ref={contentRef}
						className="slideRightContent lg:slideUpContent invert-theme z-10 select-none rounded bg-background px-9 py-8 text-foreground"
						align="start"
						sideOffset={5}
					>
						<div className="launch-editor-wrapper">
							<strong className="inline-block px-2 pb-4 font-semibold uppercase">
								Relevant Files
							</strong>
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
														<div className="mb-2 border-b border-b-gray-50 border-opacity-50 pb-2 font-sans">
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
