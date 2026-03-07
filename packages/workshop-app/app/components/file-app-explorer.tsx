import * as React from 'react'
import { Mdx } from '#app/utils/mdx.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import { cn } from '#app/utils/misc.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'
import { Icon } from './icons.tsx'

type PreviewKind = 'text' | 'markdown' | 'image' | 'video' | 'binary'

type AppFile = {
	path: string
	mimeType: string
	kind: PreviewKind
	language: string | null
}

type FileListData = {
	files: Array<AppFile>
}

type FilePreviewData = {
	code: string
}

type DirectoryEntry = {
	name: string
	path: string
	isDirectory: boolean
}

type BreadcrumbPart = {
	label: string
	path: string
	parentPath: string
	isDirectory: boolean
}

type FileIndexes = {
	filesByPath: Map<string, AppFile>
	childrenByDirectory: Map<string, Array<DirectoryEntry>>
	firstFileByDirectory: Map<string, string>
}

function toFileUrl(appName: string, filePath: string) {
	return `/app/${encodeURIComponent(appName)}/${filePath
		.split('/')
		.map(encodeURIComponent)
		.join('/')}`
}

function buildIndexes(files: Array<AppFile>): FileIndexes {
	const filesByPath = new Map<string, AppFile>()
	const childrenByDirectory = new Map<string, Array<DirectoryEntry>>()
	const childKeys = new Map<string, Set<string>>()
	const firstFileByDirectory = new Map<string, string>()

	function addChild(directoryPath: string, entry: DirectoryEntry) {
		let keys = childKeys.get(directoryPath)
		if (!keys) {
			keys = new Set()
			childKeys.set(directoryPath, keys)
		}
		if (keys.has(entry.path)) return
		keys.add(entry.path)

		let children = childrenByDirectory.get(directoryPath)
		if (!children) {
			children = []
			childrenByDirectory.set(directoryPath, children)
		}
		children.push(entry)
	}

	const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))
	for (const file of sortedFiles) {
		filesByPath.set(file.path, file)
		firstFileByDirectory.set('', firstFileByDirectory.get('') ?? file.path)

		const parts = file.path.split('/').filter(Boolean)
		for (const [index, part] of parts.entries()) {
			const nodePath = parts.slice(0, index + 1).join('/')
			const parentPath = index === 0 ? '' : parts.slice(0, index).join('/')
			const isDirectory = index < parts.length - 1
			addChild(parentPath, {
				name: part,
				path: nodePath,
				isDirectory,
			})
			if (isDirectory && !firstFileByDirectory.has(nodePath)) {
				firstFileByDirectory.set(nodePath, file.path)
			}
		}
	}

	for (const children of childrenByDirectory.values()) {
		children.sort((a, b) => {
			if (a.isDirectory && !b.isDirectory) return -1
			if (!a.isDirectory && b.isDirectory) return 1
			return a.name.localeCompare(b.name)
		})
	}

	return { filesByPath, childrenByDirectory, firstFileByDirectory }
}

function getBreadcrumbParts(pathValue: string | null): Array<BreadcrumbPart> {
	const breadcrumbs: Array<BreadcrumbPart> = [
		{ label: 'root', path: '', parentPath: '', isDirectory: true },
	]
	if (!pathValue) return breadcrumbs

	const parts = pathValue.split('/').filter(Boolean)
	for (const [index, part] of parts.entries()) {
		breadcrumbs.push({
			label: part,
			path: parts.slice(0, index + 1).join('/'),
			parentPath: index === 0 ? '' : parts.slice(0, index).join('/'),
			isDirectory: index < parts.length - 1,
		})
	}
	return breadcrumbs
}

function getSelectablePath(
	entry: DirectoryEntry,
	firstFileByDirectory: Map<string, string>,
) {
	if (!entry.isDirectory) return entry.path
	return firstFileByDirectory.get(entry.path) ?? null
}

function SiblingEntryList({
	entries,
	selectedPath,
	firstFileByDirectory,
	onSelectPath,
}: {
	entries: Array<DirectoryEntry>
	selectedPath: string | null
	firstFileByDirectory: Map<string, string>
	onSelectPath: (nextPath: string) => void
}) {
	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground px-3 py-2 text-xs">No files available.</p>
		)
	}
	return (
		<div className="max-h-72 overflow-y-auto">
			{entries.map((entry) => {
				const nextPath = getSelectablePath(entry, firstFileByDirectory)
				const isSelected = !entry.isDirectory && selectedPath === entry.path
				return (
					<button
						key={entry.path}
						type="button"
						onClick={() => {
							if (nextPath) onSelectPath(nextPath)
						}}
						className={cn(
							'hover:bg-muted/70 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
							isSelected ? 'bg-muted' : null,
						)}
					>
						<Icon
							name="Files"
							className={cn(
								'size-3.5 shrink-0',
								entry.isDirectory ? 'text-muted-foreground' : 'text-foreground/80',
							)}
							aria-hidden
						/>
						<span className="truncate">
							{entry.name}
							{entry.isDirectory ? '/' : ''}
						</span>
					</button>
				)
			})}
		</div>
	)
}

function FileContent({
	appName,
	file,
}: {
	appName: string
	file: AppFile | null
}) {
	const [mdxCode, setMdxCode] = React.useState<string | null>(null)
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
	const [isLoadingCode, setIsLoadingCode] = React.useState(false)
	const fileUrl = file ? toFileUrl(appName, file.path) : null
	const shouldCompileMdx = file?.kind === 'text' || file?.kind === 'markdown'

	React.useEffect(() => {
		if (!file || !shouldCompileMdx) {
			setMdxCode(null)
			setErrorMessage(null)
			setIsLoadingCode(false)
			return
		}
		const controller = new AbortController()
		setMdxCode(null)
		setErrorMessage(null)
		setIsLoadingCode(true)

		const params = new URLSearchParams({
			path: file.path,
			kind: file.kind,
			...(file.language ? { language: file.language } : {}),
		})
		fetch(`/app/${encodeURIComponent(appName)}/file-preview?${params}`, {
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Failed to render file (${response.status})`)
				}
				const payload = (await response.json()) as FilePreviewData
				setMdxCode(payload.code)
				setIsLoadingCode(false)
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return
				setErrorMessage(error instanceof Error ? error.message : String(error))
				setIsLoadingCode(false)
			})

		return () => controller.abort()
	}, [appName, file, shouldCompileMdx])

	if (!file) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
				Choose a file from the file picker.
			</div>
		)
	}

	if (errorMessage) {
		return (
			<div className="text-foreground-destructive p-4 text-sm">{errorMessage}</div>
		)
	}

	if (shouldCompileMdx) {
		if (isLoadingCode || !mdxCode) {
			return (
				<div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
					Rendering file...
				</div>
			)
		}
		return (
			<div className="h-full overflow-auto p-4">
				<div className="prose dark:prose-invert max-w-none">
					<Mdx code={mdxCode} />
				</div>
			</div>
		)
	}

	if (file.kind === 'image' && fileUrl) {
		return (
			<div className="flex h-full items-center justify-center p-4">
				<img
					src={fileUrl}
					alt={file.path}
					className="max-h-full max-w-full rounded border border-border object-contain"
				/>
			</div>
		)
	}

	if (file.kind === 'video' && fileUrl) {
		return (
			<div className="flex h-full items-center justify-center p-4">
				<video
					src={fileUrl}
					controls
					className="bg-background max-h-full max-w-full rounded border border-border"
				/>
			</div>
		)
	}

	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
			<p className="text-muted-foreground text-sm">
				Preview is not available for this file type ({file.mimeType}).
			</p>
			{fileUrl ? (
				<a
					href={fileUrl}
					target="_blank"
					rel="noreferrer"
					className="text-sm underline"
				>
					Open file
				</a>
			) : null}
		</div>
	)
}

export function FileAppExplorer({ appName }: { appName: string }) {
	const [files, setFiles] = React.useState<Array<AppFile>>([])
	const [isLoadingFiles, setIsLoadingFiles] = React.useState(true)
	const [filesError, setFilesError] = React.useState<string | null>(null)
	const [selectedPath, setSelectedPath] = React.useState<string | null>(null)
	const [filePickerOpen, setFilePickerOpen] = React.useState(false)
	const [fileQuery, setFileQuery] = React.useState('')
	const breadcrumbScrollRef = React.useRef<HTMLDivElement | null>(null)

	React.useEffect(() => {
		const controller = new AbortController()
		setFiles([])
		setIsLoadingFiles(true)
		setFilesError(null)
		setSelectedPath(null)
		fetch(`/app/${encodeURIComponent(appName)}/files`, {
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Failed to load files (${response.status})`)
				}
				const payload = (await response.json()) as FileListData
				setFiles(payload.files ?? [])
				setIsLoadingFiles(false)
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return
				setFilesError(error instanceof Error ? error.message : String(error))
				setIsLoadingFiles(false)
			})

		return () => controller.abort()
	}, [appName])

	const indexes = React.useMemo(() => buildIndexes(files), [files])
	const selectedFile = selectedPath
		? indexes.filesByPath.get(selectedPath) ?? null
		: null
	const breadcrumbs = React.useMemo(
		() => getBreadcrumbParts(selectedPath),
		[selectedPath],
	)
	const filteredFiles = React.useMemo(() => {
		const normalizedQuery = fileQuery.trim().toLowerCase()
		if (!normalizedQuery) return files
		return files.filter((file) => file.path.toLowerCase().includes(normalizedQuery))
	}, [fileQuery, files])

	React.useEffect(() => {
		if (selectedPath && indexes.filesByPath.has(selectedPath)) return
		setSelectedPath(files[0]?.path ?? null)
	}, [files, indexes.filesByPath, selectedPath])

	React.useEffect(() => {
		const element = breadcrumbScrollRef.current
		if (!element) return
		const raf = requestAnimationFrame(() => {
			element.scrollLeft = element.scrollWidth
		})
		return () => cancelAnimationFrame(raf)
	}, [selectedPath])

	if (isLoadingFiles) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
				Loading files...
			</div>
		)
	}

	if (filesError) {
		return (
			<div className="text-foreground-destructive flex h-full items-center justify-center px-3 text-sm">
				{filesError}
			</div>
		)
	}

	if (files.length === 0) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
				No files to display.
			</div>
		)
	}

	return (
		<div className="bg-background flex h-full min-h-0 flex-col">
			<div className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-2">
				<Popover open={filePickerOpen} onOpenChange={setFilePickerOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label="Open file chooser"
							className="hover:bg-muted text-foreground inline-flex h-8 w-8 items-center justify-center rounded border border-transparent"
						>
							<Icon name="Files" className="size-4" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-[min(420px,80vw)] p-0">
						<div className="border-border border-b p-2">
							<input
								type="text"
								value={fileQuery}
								onChange={(event) => setFileQuery(event.currentTarget.value)}
								placeholder="Filter files..."
								className="border-border bg-background w-full rounded border px-2 py-1 text-sm outline-none"
							/>
						</div>
						<div className="max-h-80 overflow-y-auto p-1">
							{filteredFiles.length ? (
								filteredFiles.map((file) => (
									<button
										key={file.path}
										type="button"
										onClick={() => {
											setSelectedPath(file.path)
											setFilePickerOpen(false)
										}}
										className={cn(
											'hover:bg-muted/70 block w-full rounded px-2 py-1.5 text-left font-mono text-xs',
											selectedPath === file.path ? 'bg-muted' : null,
										)}
									>
										{file.path}
									</button>
								))
							) : (
								<p className="text-muted-foreground px-2 py-2 text-xs">
									No matching files.
								</p>
							)}
						</div>
					</PopoverContent>
				</Popover>

				<div
					ref={breadcrumbScrollRef}
					className="scrollbar-thin scrollbar-thumb-scrollbar min-w-0 flex-1 overflow-x-auto"
				>
					<div className="flex w-max min-w-full items-center gap-1 pr-2">
						{breadcrumbs.map((crumb, index) => {
							const siblings =
								index === 0
									? indexes.childrenByDirectory.get('')
									: indexes.childrenByDirectory.get(crumb.parentPath)
							const isCurrent =
								crumb.path === selectedPath ||
								(index === 0 && selectedPath === null)
							return (
								<React.Fragment key={`${crumb.path || 'root'}:${index}`}>
									<Popover>
										<PopoverTrigger asChild>
											<button
												type="button"
												className={cn(
													'hover:bg-muted inline-flex h-7 items-center rounded px-2 font-mono text-xs',
													isCurrent
														? 'bg-muted text-foreground'
														: 'text-muted-foreground',
												)}
											>
												{crumb.label}
											</button>
										</PopoverTrigger>
										<PopoverContent align="start" className="w-72 p-1">
											<SiblingEntryList
												entries={siblings ?? []}
												selectedPath={selectedPath}
												firstFileByDirectory={indexes.firstFileByDirectory}
												onSelectPath={setSelectedPath}
											/>
										</PopoverContent>
									</Popover>
									{index < breadcrumbs.length - 1 ? (
										<span className="text-muted-foreground text-xs">/</span>
									) : null}
								</React.Fragment>
							)
						})}
					</div>
				</div>

				{selectedFile ? (
					<LaunchEditor
						appName={appName}
						appFile={`${selectedFile.path},1,1`}
						className="text-muted-foreground hover:text-foreground text-xs"
					>
						Open in editor
					</LaunchEditor>
				) : null}
			</div>
			<div className="min-h-0 flex-1">
				<FileContent appName={appName} file={selectedFile} />
			</div>
		</div>
	)
}
