import fs from 'fs'
import path from 'path'
import { remarkCodeBlocksShiki } from '@kentcdodds/md-temp'
import { type Element, type Root as HastRoot } from 'hast'
import lz from 'lz-string'
import { type Root as MdastRoot } from 'mdast'
import { type MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import { bundleMDX } from 'mdx-bundler'
import PQueue from 'p-queue'
import remarkAutolinkHeadings from 'remark-autolink-headings'
import emoji from 'remark-emoji'
import gfm from 'remark-gfm'
import { type PluggableList } from 'unified'
import { visit } from 'unist-util-visit'
import {
	cachified,
	compiledInstructionMarkdownCache,
	compiledMarkdownCache,
	shouldForceFresh,
} from './cache.server.js'
import { type Timings } from './timing.server.js'
import { checkConnectionCached } from './utils.server.js'

function remarkMermaidCodeToSvg() {
	return async (tree: MdastRoot) => {
		const promises: Array<Promise<void>> = []
		visit(tree, 'code', (node, index, parent) => {
			if (node.lang === 'mermaid' && parent && typeof index === 'number') {
				const promise = (async () => {
					const isConnected = await checkConnectionCached()
					if (isConnected) {
						const compressed = lz.compressToEncodedURIComponent(node.value)
						const url = `https://mermaid-to-svg.kentcdodds.workers.dev/svg?mermaid=${compressed}`

						const timeout = AbortSignal.timeout(5000)
						const svgResponse = await fetch(url, { signal: timeout }).catch(
							() => null,
						)
						if (svgResponse?.ok) {
							const svgText = await svgResponse.text()
							if (svgText) {
								parent.children[index] = {
									type: 'mdxJsxFlowElement',
									name: 'div',
									attributes: [
										{
											type: 'mdxJsxAttribute',
											name: 'className',
											value: 'mermaid not-prose',
										},
										{
											type: 'mdxJsxAttribute',
											name: 'dangerouslySetInnerHTML',
											value: {
												type: 'mdxJsxAttributeValueExpression',
												value: `{__html: ${JSON.stringify(svgText)}}`,
												// This hack brought to you by this: https://github.com/syntax-tree/hast-util-to-estree/blob/e5ccb97e9f42bba90359ea6d0f83a11d74e0dad6/lib/handlers/mdx-expression.js#L35-L38
												// no idea why we're required to have estree here, but I'm pretty sure someone is supposed to add it automatically for us and it just never happens...
												data: {
													estree: {
														type: 'Program',
														sourceType: 'script',
														body: [
															{
																type: 'ExpressionStatement',
																expression: {
																	type: 'ObjectExpression',
																	properties: [
																		{
																			type: 'Property',
																			method: false,
																			shorthand: false,
																			computed: false,
																			kind: 'init',
																			key: {
																				type: 'Identifier',
																				name: '__html',
																			},
																			value: {
																				type: 'Literal',
																				value: svgText,
																			},
																		},
																	],
																},
															},
														],
													},
												},
											},
										},
									],
									children: [],
								} satisfies MdxJsxFlowElement
								return
							}
						}
					}

					parent.children[index] = {
						type: 'mdxJsxFlowElement',
						name: 'Mermaid',
						attributes: [
							{
								type: 'mdxJsxAttribute',
								name: 'code',
								value: node.value,
							},
						],
						children: [],
					} satisfies MdxJsxFlowElement
				})()
				promises.push(promise)
			}
		})
		await Promise.all(promises)
	}
}

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

const verboseLog =
	process.env.EPICSHOP_VERBOSE_LOG === 'true' ? console.log : () => {}

export async function compileMdx(
	file: string,
	{
		request,
		timings,
		forceFresh,
	}: {
		request?: Request
		timings?: Timings
		forceFresh?: boolean
	} = {},
) {
	const stat = await fs.promises
		.stat(file)
		.catch((error: unknown) => ({ error }))
	if ('error' in stat) {
		throw new Error(`File stat cannot be read: ${stat.error}`)
	}

	const key = `file:${file}`
	forceFresh = await shouldForceFresh({ forceFresh, request, key })

	const existingCacheEntry = await compiledInstructionMarkdownCache.get(key)
	if (!forceFresh && existingCacheEntry) {
		forceFresh = stat.mtimeMs > existingCacheEntry.metadata.createdTime
	}

	return cachified({
		key,
		cache: compiledInstructionMarkdownCache,
		request,
		timings,
		forceFresh,
		getFreshValue: () => compileMdxImpl(file),
	})
}

async function compileMdxImpl(file: string): Promise<{
	code: string
	title: string | null
	epicVideoEmbeds: Array<string>
}> {
	let title: string | null = null
	const epicVideoEmbeds: Array<string> = []

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
					remarkMermaidCodeToSvg,
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
