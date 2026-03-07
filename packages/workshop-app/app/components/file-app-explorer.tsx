import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import { Tree, type NodeRendererProps } from 'react-arborist'
import remarkGfm from 'remark-gfm'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'
import { cn } from '#app/utils/misc.tsx'
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

type ExplorerNode = {
	id: string
	name: string
	path: string
	isDirectory: boolean
	file?: AppFile
	children?: Array<ExplorerNode>
}

function toFileUrl(appName: string, filePath: string) {
	return `/app/${encodeURIComponent(appName)}/${filePath
		.split('/')
		.map(encodeURIComponent)
		.join('/')}`
}

function buildTree(files: Array<AppFile>): Array<ExplorerNode> {
	const root: Array<ExplorerNode> = []
	const directoryMap = new Map<string, ExplorerNode>()

	for (const file of files) {
		const parts = file.path.split('/').filter(Boolean)
		let currentChildren = root
		let currentPath = ''
		for (const [index, part] of parts.entries()) {
			currentPath = currentPath ? `${currentPath}/${part}` : part
			const isFile = index === parts.length - 1
			if (isFile) {
				currentChildren.push({
					id: `file:${currentPath}`,
					name: part,
					path: currentPath,
					isDirectory: false,
					file,
				})
				continue
			}
			let directory = directoryMap.get(currentPath)
			if (!directory) {
				directory = {
					id: `dir:${currentPath}`,
					name: part,
					path: currentPath,
					isDirectory: true,
					children: [],
				}
				directoryMap.set(currentPath, directory)
				currentChildren.push(directory)
			}
			currentChildren = directory.children ?? []
			directory.children = currentChildren
		}
	}

	sortNodes(root)
	return root
}

function sortNodes(nodes: Array<ExplorerNode>) {
	nodes.sort((a, b) => {
		if (a.isDirectory && !b.isDirectory) return -1
		if (!a.isDirectory && b.isDirectory) return 1
		return a.name.localeCompare(b.name)
	})
	for (const node of nodes) {
		if (node.children) sortNodes(node.children)
	}
}

function useElementHeight<T extends HTMLElement>() {
	const ref = React.useRef<T | null>(null)
	const [height, setHeight] = React.useState(0)

	React.useEffect(() => {
		const element = ref.current
		if (!element) return
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (entry) setHeight(Math.max(0, Math.floor(entry.contentRect.height)))
		})
		observer.observe(element)
		setHeight(Math.max(0, Math.floor(element.getBoundingClientRect().height)))
		return () => observer.disconnect()
	}, [])

	return { ref, height }
}

function ExplorerTreeNode({
	node,
	style,
	onSelectFile,
}: NodeRendererProps<ExplorerNode> & {
	onSelectFile: (filePath: string) => void
}) {
	const data = node.data
	const isDirectory = data.isDirectory
	const isSelected = node.isSelected

	return (
		<button
			type="button"
			style={style}
			className={cn(
				'hover:bg-muted/60 text-foreground flex w-full cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm',
				isSelected ? 'bg-muted' : null,
			)}
			onClick={() => {
				node.select()
				if (isDirectory) {
					node.toggle()
				} else {
					onSelectFile(data.path)
				}
			}}
		>
			{isDirectory ? (
				<Icon
					name={node.isOpen ? 'ChevronDown' : 'ChevronRight'}
					className="text-muted-foreground size-3.5 shrink-0"
					aria-hidden
				/>
			) : (
				<span className="inline-block w-3.5 shrink-0" />
			)}
			<Icon
				name="Files"
				className={cn(
					'size-3.5 shrink-0',
					isDirectory ? 'text-muted-foreground' : 'text-foreground/80',
				)}
				aria-hidden
			/>
			<span className="truncate">{data.name}</span>
		</button>
	)
}

function FileContent({
	appName,
	file,
}: {
	appName: string
	file: AppFile | null
}) {
	const [content, setContent] = React.useState<string | null>(null)
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
	const isTextLike = file?.kind === 'text' || file?.kind === 'markdown'
	const fileUrl = file ? toFileUrl(appName, file.path) : null

	React.useEffect(() => {
		if (!file || !fileUrl || !isTextLike) {
			setContent(null)
			setErrorMessage(null)
			return
		}
		const controller = new AbortController()
		setContent(null)
		setErrorMessage(null)
		fetch(fileUrl, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Failed to load file (${response.status})`)
				}
				const text = await response.text()
				setContent(text)
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return
				setErrorMessage(error instanceof Error ? error.message : String(error))
			})

		return () => controller.abort()
	}, [file, fileUrl, isTextLike])

	if (!file) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
				Choose a file from the explorer.
			</div>
		)
	}

	if (errorMessage) {
		return (
			<div className="text-foreground-destructive p-4 text-sm">{errorMessage}</div>
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

	if (file.kind === 'markdown') {
		if (content === null) {
			return (
				<div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
					Loading markdown...
				</div>
			)
		}
		return (
			<div className="h-full overflow-auto p-4">
				<article className="prose dark:prose-invert max-w-none">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
				</article>
			</div>
		)
	}

	if (file.kind === 'text') {
		if (content === null) {
			return (
				<div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
					Loading file...
				</div>
			)
		}
		const language = file.language ?? 'text'
		return (
			<div className="h-full overflow-auto p-4">
				<div className="mb-2 inline-flex rounded border border-border bg-muted px-2 py-1 font-mono text-xs uppercase">
					{language}
				</div>
				<pre className="bg-muted/40 scrollbar-thin scrollbar-thumb-scrollbar overflow-x-auto rounded border border-border p-4 text-sm">
					<code
						className={cn(file.language ? `language-${file.language}` : null)}
						data-language={language}
					>
						{content}
					</code>
				</pre>
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

export function FileAppExplorer({
	appName,
}: {
	appName: string
}) {
	const [files, setFiles] = React.useState<Array<AppFile>>([])
	const [isLoadingFiles, setIsLoadingFiles] = React.useState(true)
	const [filesError, setFilesError] = React.useState<string | null>(null)
	const [selectedPath, setSelectedPath] = React.useState<string | null>(null)
	const { ref: treeContainerRef, height: treeHeight } =
		useElementHeight<HTMLDivElement>()

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

	const treeData = React.useMemo(() => buildTree(files), [files])
	const fileMap = React.useMemo(
		() => new Map(files.map((file) => [file.path, file])),
		[files],
	)

	React.useEffect(() => {
		if (selectedPath && fileMap.has(selectedPath)) return
		setSelectedPath(files[0]?.path ?? null)
	}, [fileMap, files, selectedPath])

	const selectedFile = selectedPath ? fileMap.get(selectedPath) ?? null : null
	const selectedDisplayPath = selectedFile?.path ?? null

	return (
		<div className="grid h-full min-h-0 grid-cols-[minmax(220px,320px)_1fr]">
			<div className="border-border bg-background/60 flex min-h-0 flex-col border-r">
				<div className="border-border text-muted-foreground flex h-10 shrink-0 items-center border-b px-3 text-xs uppercase">
					Files
				</div>
				<div ref={treeContainerRef} className="min-h-0 flex-1 overflow-hidden p-2">
					{isLoadingFiles ? (
						<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
							Loading files...
						</div>
					) : filesError ? (
						<div className="text-foreground-destructive flex h-full items-center justify-center px-3 text-sm">
							{filesError}
						</div>
					) : files.length === 0 ? (
						<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
							No files to display.
						</div>
					) : (
						<Tree<ExplorerNode>
							data={treeData}
							width="100%"
							height={treeHeight || 360}
							indent={16}
							openByDefault={false}
							disableDrag
							disableDrop
							selection={selectedPath ? `file:${selectedPath}` : undefined}
							onActivate={(node) => {
								if (!node.data.isDirectory) {
									setSelectedPath(node.data.path)
								}
							}}
						>
							{(props) => (
								<ExplorerTreeNode {...props} onSelectFile={setSelectedPath} />
							)}
						</Tree>
					)}
				</div>
			</div>
			<div className="bg-background flex min-h-0 flex-col">
				<div className="border-border flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
					<p className="text-muted-foreground truncate font-mono text-xs">
						{selectedDisplayPath ?? 'Select a file'}
					</p>
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
		</div>
	)
}

