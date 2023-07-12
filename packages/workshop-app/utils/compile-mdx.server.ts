import fs from 'fs'
import fsExtra from 'fs-extra'
import path from 'path'
import { bundleMDX } from 'mdx-bundler'
import { type PluggableList } from 'unified'
import { type Element, type Root as HastRoot } from 'hast'
import { type Root as MdastRoot } from 'mdast'
import { remarkCodeBlocksShiki } from '@kentcdodds/md-temp'
import {
	type CodeFileData,
	type EmbeddedFile,
	remarkCodeFile,
} from './codefile-mdx.server.ts'
import { type CacheEntry, cachified } from 'cachified'
import { compiledMarkdownCache, embeddedFilesCache } from './cache.server.ts'
import { visit } from 'unist-util-visit'
import md5 from 'md5-hex'
import remarkAutolinkHeadings from 'remark-autolink-headings'
import gfm from 'remark-gfm'
// @ts-ignore - remark-emoji don't have an exports from ESM types
import emoji from 'remark-emoji'

const cacheDir = path.join(
	process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(),
	'./node_modules/.cache/compile-mdx',
)

function trimCodeBlocks() {
	return async function transformer(tree: HastRoot) {
		visit(tree, 'element', (preNode: Element) => {
			if (preNode.tagName !== 'pre' || !preNode.children.length) {
				return
			}
			const codeNode = preNode.children[0]
			if (
				!codeNode ||
				codeNode.type !== 'element' ||
				codeNode.tagName !== 'code'
			) {
				return
			}
			const [codeStringNode] = codeNode.children
			if (!codeStringNode) return

			if (codeStringNode.type !== 'text') {
				console.warn(
					`trimCodeBlocks: Unexpected: codeStringNode type is not "text": ${codeStringNode.type}`,
				)
				return
			}
			codeStringNode.value = codeStringNode.value.trimEnd()
		})
	}
}

function removePreContainerDivs() {
	return async function preContainerDivsTransformer(tree: HastRoot) {
		visit(
			tree,
			{ type: 'element', tagName: 'pre' },
			function visitor(node, index, parent) {
				if (parent?.type !== 'element') return
				if (parent.tagName !== 'div') return
				if (parent.children.length !== 1 && index === 0) return
				Object.assign(parent, node)
			},
		)
	}
}

const rehypePlugins: PluggableList = [
	trimCodeBlocks,
	remarkCodeBlocksShiki,
	removePreContainerDivs,
]

function checkFileExists(file: string) {
	return fs.promises.access(file, fs.constants.F_OK).then(
		() => true,
		() => false,
	)
}

/**
 * @param embeddedFiles {string[]} - list of embedded files
 * @param lastCompiledTime {number} - timestamp indicating the last time mdx file was compiled
 * @returns true if all embedded file mtimeMs are older then the file compiled time,
 * false if we need update
 */
function validateEmbeddedFiles(
	embeddedFiles: IterableIterator<EmbeddedFile>,
	lastCompiledTime: number,
): Promise<boolean> {
	if (process.env.NODE_ENV !== 'development') return Promise.resolve(true)
	return Promise.all(
		Array.from(embeddedFiles).map(async ({ file }) => {
			const stat = await fs.promises.stat(file).catch(() => ({ mtimeMs: 0 }))
			return lastCompiledTime > stat.mtimeMs || Promise.reject()
		}),
	).then(
		() => true,
		() => false,
	)
}

export async function compileMdx(
	file: string,
): Promise<{ code: string; title: string | null }> {
	if (!(await checkFileExists(file))) {
		throw new Error(`File does not exist: ${file}`)
	}

	let cachedEmbeddedFiles = new Map<string, EmbeddedFile>()

	const stat = await fs.promises.stat(file)
	const cacheLocation = path.join(cacheDir, `${md5(file)}.json`)

	if (await checkFileExists(cacheLocation)) {
		const cached = JSON.parse(
			await fs.promises.readFile(cacheLocation, 'utf-8'),
		) as any

		cachedEmbeddedFiles = new Map(
			Object.entries(cached.value.embeddedFiles ?? {}),
		)

		const compiledTime = cached.value.compiledTime ?? 0
		const warningCancled =
			process.env.NODE_ENV === 'development'
				? cached?.value?.warningCancled ?? false
				: false
		if (
			compiledTime > stat.mtimeMs &&
			!warningCancled &&
			(await validateEmbeddedFiles(cachedEmbeddedFiles.values(), compiledTime))
		) {
			return cached.value
		}
	}
	let title: string | null = null
	const codeFileData = {
		mdxFile: file,
		cacheLocation,
		cachedEmbeddedFiles,
		embeddedFiles: new Map<string, EmbeddedFile>(),
	}

	try {
		const { code } = await bundleMDX({
			file,
			cwd: path.dirname(file),
			mdxOptions(options) {
				options.remarkPlugins = [
					...(options.remarkPlugins ?? []),
					[remarkAutolinkHeadings, { behavior: 'wrap' }],
					gfm,
					() => (tree: MdastRoot) => {
						visit(tree, 'heading', node => {
							if (title) return
							if (node.depth === 1) {
								visit(node, 'text', textNode => {
									title = textNode.value.trim()
								})
							}
						})
						title = title ? title.replace(/^\d+\. /, '').trim() : null
					},
					() => remarkCodeFile(codeFileData),
					emoji,
				]
				options.rehypePlugins = [
					...(options.rehypePlugins ?? []),
					...rehypePlugins,
				]
				options.mdxExtensions = ['.mdx', '.md']
				options.format = 'mdx'
				options.development = false
				return options
			},
		})

		const result = { code, title }
		await fsExtra.ensureDir(cacheDir)
		await fs.promises.writeFile(
			cacheLocation,
			JSON.stringify({
				value: {
					...result,
					compiledTime: Date.now(),
					embeddedFiles: codeFileData.embeddedFiles.size
						? Object.fromEntries(codeFileData.embeddedFiles)
						: undefined,
				},
			}),
		)
		await updateEmbeddedFilesCache(codeFileData)
		return result
	} catch (error: unknown) {
		console.error(`Compilation error for file: `, file, error)
		throw error
	}
}

export async function compileMarkdownString(markdownString: string) {
	return cachified({
		key: markdownString,
		cache: compiledMarkdownCache,
		ttl: 1000 * 60 * 60 * 24,
		getFreshValue: async () => {
			try {
				const result = await bundleMDX({
					source: markdownString,
					mdxOptions(options) {
						options.rehypePlugins = [
							...(options.rehypePlugins ?? []),
							...rehypePlugins,
						]
						options.development = false
						return options
					},
				})

				return result.code
			} catch (error: unknown) {
				console.error(`Compilation error for code: `, markdownString, error)
				throw error
			}
		},
	})
}

declare global {
	var __modified_embedded_files_time__: Map<string, number>
}

const modifiedEmbeddedFilesTime = (global.__modified_embedded_files_time__ =
	global.__modified_embedded_files_time__ ?? new Map<string, number>())

type CachedEmbeddedFilesList = Record<string, string[]>

const EMBEDDED_FILES_CACHE_KEY = 'embeddedFilesCache'

async function updateEmbeddedFilesCache({
	mdxFile,
	embeddedFiles,
}: CodeFileData) {
	if (mdxFile.includes('playground')) return
	let cachedList = await getEmbeddedFilesCache()
	const hash = cachedList ? md5(JSON.stringify(cachedList)) : null

	// make sure we get clean list before updating it
	if (cachedList) {
		for (const [key, value] of Object.entries(cachedList)) {
			cachedList[key] = value.filter(item => item !== mdxFile)
			if (cachedList[key]?.length === 0) {
				delete cachedList[key]
			}
		}
	}

	if (embeddedFiles.size) {
		if (!cachedList) {
			cachedList = {}
		}
		const files = Array.from(
			new Set(Array.from(embeddedFiles.values()).map(({ file }) => file)),
		).sort()
		for (const file of files) {
			cachedList[file] = [...(cachedList[file] || []), mdxFile]
		}
	}

	if (cachedList && hash !== md5(JSON.stringify(cachedList))) {
		await fsExtra.ensureDir(cacheDir)
		const embeddedFilesLocation = path.join(cacheDir, 'embeddedFiles.json')
		modifiedEmbeddedFilesTime.set(EMBEDDED_FILES_CACHE_KEY, Date.now())
		await fs.promises.writeFile(
			embeddedFilesLocation,
			JSON.stringify({ ...cachedList }),
		)
	}
}

async function getEmbeddedFilesCache() {
	const key = EMBEDDED_FILES_CACHE_KEY

	function getForceFresh(cacheEntry: CacheEntry | null | undefined) {
		if (!cacheEntry) return true
		const latestModifiedTime = modifiedEmbeddedFilesTime.get(key)
		if (!latestModifiedTime) return undefined
		return latestModifiedTime > cacheEntry.metadata.createdTime
			? true
			: undefined
	}

	return cachified({
		key,
		cache: embeddedFilesCache,
		ttl: 1000 * 60 * 60 * 24,
		forceFresh: getForceFresh(await embeddedFilesCache.get(key)),
		getFreshValue: async () => {
			try {
				const embeddedFilesLocation = path.join(cacheDir, 'embeddedFiles.json')
				if (await checkFileExists(embeddedFilesLocation)) {
					return JSON.parse(
						await fs.promises.readFile(embeddedFilesLocation, 'utf-8'),
					) as CachedEmbeddedFilesList
				}
			} catch (error: unknown) {
				console.error(`Unable to read 'embeddedFiles.json' from: `, cacheDir)
			}
			return undefined
		},
	})
}

export async function isEmbeddedFile(filePath: string) {
	if (process.env.NODE_ENV !== 'development') return false
	const embeddedFilesList = await getEmbeddedFilesCache()
	if (embeddedFilesList) {
		const embeddedFiles = Object.keys(embeddedFilesList)
		return embeddedFiles.includes(filePath.replace(/\\/g, '/'))
	}
	return false
}
