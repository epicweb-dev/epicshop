import fs from 'fs'
import path from 'path'
import { cachified, type CacheEntry } from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
import { remarkCodeBlocksShiki } from '@kentcdodds/md-temp'
import fsExtra from 'fs-extra'
import { type Element, type Root as HastRoot } from 'hast'
import md5 from 'md5-hex'
import { type Root as MdastRoot } from 'mdast'
import { bundleMDX } from 'mdx-bundler'
import PQueue from 'p-queue'
import remarkAutolinkHeadings from 'remark-autolink-headings'
import emoji from 'remark-emoji'
import gfm from 'remark-gfm'
import { type PluggableList } from 'unified'
import { visit } from 'unist-util-visit'
import {
	compiledMarkdownCache,
	embeddedFilesCache,
	shouldForceFresh,
	type CachedEmbeddedFilesList,
} from './cache.server.js'
import {
	remarkCodeFile,
	type CodeFileData,
	type EmbeddedFile,
} from './codefile-mdx.server.js'

const cacheDir = path.join(
	process.env.EPICSHOP_CONTEXT_CWD ?? process.cwd(),
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

const rehypePlugins = [
	trimCodeBlocks,
	remarkCodeBlocksShiki,
	removePreContainerDivs,
] satisfies PluggableList

function checkFileExists(file: string) {
	return fs.promises.access(file, fs.constants.F_OK).then(
		() => true,
		() => false,
	)
}

const verboseLog =
	process.env.EPICSHOP_VERBOSE_LOG === 'true' ? console.log : () => {}

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
	{ request, forceFresh }: { request?: Request; forceFresh?: boolean } = {},
): Promise<{
	code: string
	title: string | null
	epicVideoEmbeds: Array<string>
}> {
	if (!(await checkFileExists(file))) {
		throw new Error(`File does not exist: ${file}`)
	}

	let cachedEmbeddedFiles = new Map<string, EmbeddedFile>()

	const stat = await fs.promises.stat(file)
	const cacheLocation = path.join(cacheDir, `${md5(file)}.json`)

	const requireFresh = await shouldForceFresh({
		forceFresh,
		request,
		key: cacheLocation,
	})
	if (!requireFresh && (await checkFileExists(cacheLocation))) {
		try {
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
				(await validateEmbeddedFiles(
					cachedEmbeddedFiles.values(),
					compiledTime,
				))
			) {
				return cached.value
			}
		} catch (error) {
			console.error(`Error reading cached file: ${cacheLocation}`, error)
			void fs.promises.unlink(cacheLocation)
		}
	}
	let title: string | null = null
	const epicVideoEmbeds: Array<string> = []
	const codeFileData = {
		mdxFile: file,
		cacheLocation,
		cachedEmbeddedFiles,
		embeddedFiles: new Map<string, EmbeddedFile>(),
	}

	try {
		verboseLog(`Compiling ${file}`)
		const bundleResult = await queuedBundleMDX({
			file,
			cwd: path.dirname(file),
			mdxOptions(options) {
				options.remarkPlugins = [
					...(options.remarkPlugins ?? []),
					[remarkAutolinkHeadings, { behavior: 'wrap' }],
					gfm,
					() => (tree: MdastRoot) => {
						visit(tree, 'heading', (node) => {
							if (title) return
							if (node.depth === 1) {
								visit(node, 'text', (textNode) => {
									title = textNode.value.trim()
								})
							}
						})
						title = title ? title.replace(/^\d+\. /, '').trim() : null
					},
					() => (tree: MdastRoot) => {
						visit(tree, 'mdxJsxFlowElement', (jsxEl) => {
							if (jsxEl.name !== 'EpicVideo') return
							const urlAttr = jsxEl.attributes.find(
								(a) => a.type === 'mdxJsxAttribute' && a.name === 'url',
							)
							if (!urlAttr) return
							let url = urlAttr.value
							if (typeof url !== 'string') return
							if (url.endsWith('/')) url = url.slice(0, -1)
							epicVideoEmbeds.push(url)
						})
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
		if (!bundleResult) throw new Error(`Timeout for file: ${file}`)

		const result = { code: bundleResult.code, title, epicVideoEmbeds }
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
	} finally {
		verboseLog(`Successfully compiled ${file}`)
	}
}

export async function compileMarkdownString(markdownString: string) {
	return cachified({
		key: markdownString,
		cache: compiledMarkdownCache,
		ttl: 1000 * 60 * 60 * 24,
		getFreshValue: async () => {
			try {
				verboseLog(`Compiling string`, markdownString)
				const result = await queuedBundleMDX({
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
				if (!result) throw new Error(`Timed out compiling markdown string`)

				return result.code
			} catch (error: unknown) {
				console.error(`Compilation error for code: `, markdownString, error)
				throw error
			} finally {
				verboseLog(`Successfully compiled string`, markdownString)
			}
		},
	})
}

const modifiedEmbeddedFilesTime = remember(
	'modified_embedded_files_time',
	() => new Map<string, number>(),
)

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
			cachedList[key] = value.filter((item) => item !== mdxFile)
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
			cachedList[file] = [...(cachedList[file] ?? []), mdxFile]
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
		forceFresh: getForceFresh(embeddedFilesCache.get(key)),
		getFreshValue: async () => {
			try {
				const embeddedFilesLocation = path.join(cacheDir, 'embeddedFiles.json')
				if (await checkFileExists(embeddedFilesLocation)) {
					return JSON.parse(
						await fs.promises.readFile(embeddedFilesLocation, 'utf-8'),
					) as CachedEmbeddedFilesList
				}
			} catch {
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

let _queue: PQueue | null = null
async function getQueue() {
	if (_queue) return _queue

	_queue = new PQueue({
		concurrency: 1,
		throwOnTimeout: true,
		timeout: 1000 * 60,
	})
	return _queue
}

// We have to use a queue because we can't run more than one of these at a time
// or we'll hit an out of memory error because esbuild uses a lot of memory...
async function queuedBundleMDX(...args: Parameters<typeof bundleMDX>) {
	const queue = await getQueue()
	const result = await queue.add(() => bundleMDX(...args))
	return result
}

// TODO: Fix these
/*
eslint
	"@typescript-eslint/no-unsafe-assignment": "off",
	"@typescript-eslint/no-unsafe-member-access": "off",
	"@typescript-eslint/no-unnecessary-condition": "off",
	"@typescript-eslint/no-unsafe-argument": "off",
*/
