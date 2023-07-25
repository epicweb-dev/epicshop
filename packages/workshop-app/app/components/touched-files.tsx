import * as React from 'react'
import { Await, useLoaderData } from '@remix-run/react'
import * as Popover from '@radix-ui/react-popover'
import { type loader } from '~/routes/_app+/_exercises+/$exerciseNumber_.$stepNumber.$type.tsx'
import { LaunchEditor } from '~/routes/launch-editor.tsx'
import { Icon } from './icons.tsx'
import { SetAppToPlayground } from '~/routes/set-playground.tsx'

function TouchedFiles() {
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
						className="flex h-full items-center gap-1 border-r border-border px-6 py-3 font-mono text-sm uppercase"
						aria-label="Relevant Files"
					>
						<Icon name="Files" />
						Files
					</button>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						ref={contentRef}
						className="slideRightContent lg:slideUpContent invert-theme z-10 select-none rounded border-border bg-background px-9 py-8 text-foreground"
						align="start"
						sideOffset={5}
					>
						<div className="launch-editor-wrapper">
							<strong className="inline-block px-2 pb-4 font-semibold uppercase">
								Relevant Files
							</strong>
							{data.problem &&
							data.playground?.appName !== data.problem?.name ? (
								<div className="mb-2 rounded p-1 font-mono font-medium">
									<SetAppToPlayground appName={data.problem.name} />
								</div>
							) : null}
							<div id="files">
								<React.Suspense
									fallback={
										<div className="flex justify-center">
											<Icon
												name="Refresh"
												className="h-8 w-8 animate-spin"
												title="Loading diff"
											/>
										</div>
									}
								>
									<Await
										resolve={data.diff}
										errorElement={
											<div className="text-foreground-danger">
												Something went wrong.
											</div>
										}
									>
										{({ diffFiles }) => {
											if (!diffFiles) {
												return (
													<p className="text-foreground-danger">
														Unable to determine diff
													</p>
												)
											}
											if (typeof diffFiles === 'string') {
												return (
													<p className="text-foreground-danger">{diffFiles}</p>
												)
											}
											if (!diffFiles.length) {
												return <p>No files changed</p>
											}

											const props =
												appName || ENV.KCDSHOP_GITHUB_ROOT
													? {}
													: {
															title:
																"You must 'Set to Playground' before opening a file",
															className: 'not-allowed',
													  }
											return (
												<ul {...props}>
													{diffFiles.length > 1 && !ENV.KCDSHOP_DEPLOYED ? (
														<div className="mb-2 border-b border-b-gray-50 border-opacity-50 pb-2 font-sans">
															<LaunchEditor
																appFile={diffFiles.map(file => file.path)}
																appName="playground"
																onUpdate={handleLaunchUpdate}
															>
																<p>Open All Files</p>
															</LaunchEditor>
														</div>
													) : null}
													{diffFiles.map(file => (
														<li key={file.path} data-state={file.status}>
															<LaunchEditor
																appFile={file.path}
																appName={
																	ENV.KCDSHOP_DEPLOYED
																		? data.problem?.name ?? 'playground'
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
