import * as React from 'react'
import { Await, useLoaderData } from '@remix-run/react'
import * as Popover from '@radix-ui/react-popover'
import { type loader } from '~/routes/_app+/_exercises+/$exerciseNumber_.$stepNumber.$type.tsx'
import { LaunchEditor } from '~/routes/launch-editor.tsx'
import Icon from './icons.tsx'
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
						className="flex h-full items-center gap-1 border-r border-gray-200 px-6 py-3 font-mono text-sm uppercase"
						aria-label="Relevant Files"
					>
						<Icon name="Files" />
						Files
					</button>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						ref={contentRef}
						className="slidUpContent select-none rounded bg-black px-9 py-8 text-white"
						align="start"
						sideOffset={5}
					>
						<div className="launch-editor-wrapper">
							<strong className="inline-block px-2 pb-4 font-semibold uppercase">
								Relevant Files
							</strong>
							{data.problem &&
							data.playground?.appName !== data.problem?.name ? (
								<div className="mb-2 rounded bg-white p-1 font-mono text-sm font-medium">
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
											<div className="text-rose-300">Something went wrong.</div>
										}
									>
										{({ diffFiles }) => {
											if (typeof diffFiles === 'string') {
												return <p className="text-rose-300">{diffFiles}</p>
											}
											if (!diffFiles.length) {
												return <p>No files changed</p>
											}

											const title =
												"You must 'Set to Playground' before opening a file"
											const props = appName
												? {}
												: { title, className: 'not-allowed' }
											return (
												<ul {...props}>
													{diffFiles.length > 1 ? (
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
																appName="playground"
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
