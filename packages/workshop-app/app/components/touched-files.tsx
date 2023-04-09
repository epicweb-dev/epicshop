import * as React from 'react'
import { Await, useLoaderData } from '@remix-run/react'
import * as Popover from '@radix-ui/react-popover'
import { type loader } from '~/routes/_app+/_exercises+/$exerciseNumber_.$stepNumber.$type'
import { LaunchEditor } from '~/routes/launch-editor'
import Icon from './icons'

function TouchedFiles() {
	const data = useLoaderData<typeof loader>()
	const fileListRef = React.useRef<{ name: string; children: JSX.Element }>()

	const [open, setOpen] = React.useState(false)
	const contentRef = React.useRef<HTMLDivElement>(null)

	function handleLaunchUpdate(state: string) {
		const setVisibility = (visible: boolean) => {
			if (contentRef.current) {
				contentRef.current.style.visibility = visible ? 'visible' : 'collapse'
			}
		}
		switch (state) {
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
	}

	function getFileList() {
		const appName = data.playground?.appName

		if (!appName || appName !== data.problem?.name) {
			return <p className="px-2 text-rose-700">You need to set Playground</p>
		}

		if (fileListRef.current?.name === appName) {
			return fileListRef.current.children
		}

		const fileList = (
			<div id="files">
				<React.Suspense
					fallback={
						<div className="p-8">
							<Icon
								name="Refresh"
								className="animate-spin"
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

							const allFiles =
								diffFiles.length > 1 && diffFiles.map(file => file.path)
							return (
								<>
									{allFiles ? (
										<div className="mb-2 border-b border-b-gray-50 border-opacity-50 pb-2 font-sans">
											<LaunchEditor
												appFile={allFiles}
												appName={appName}
												onUpdate={handleLaunchUpdate}
											>
												<p>Open All Files</p>
											</LaunchEditor>
										</div>
									) : null}
									{diffFiles.length ? (
										<ul>
											{diffFiles.map(file => (
												<li key={file.path} data-state={file.status}>
													<LaunchEditor
														appFile={file.path}
														appName={appName}
														onUpdate={handleLaunchUpdate}
													>
														<code>{file.path}</code>
													</LaunchEditor>
												</li>
											))}
										</ul>
									) : (
										<p>No files changed</p>
									)}
								</>
							)
						}}
					</Await>
				</React.Suspense>
			</div>
		)
		fileListRef.current = {
			name: appName,
			children: fileList,
		}
		return fileList
	}

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
						className="slidUpContent rounded bg-black px-9 py-8 text-white"
						align="start"
						sideOffset={5}
					>
						<div className="launch-editor-wrapper">
							<strong className="inline-block px-2 pb-4 font-semibold uppercase">
								Relevant Files
							</strong>
							{open ? getFileList() : null}
						</div>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</>
	)
}

export default TouchedFiles
