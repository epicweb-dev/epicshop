import './init-env.ts'

import fs from 'fs'
import path from 'path'
import { rehypeCodeBlocksShiki } from '@kentcdodds/md-temp'
import * as cookie from 'cookie'
import { type Element, type Root as HastRoot } from 'hast'
import lz from 'lz-string'
import md5 from 'md5-hex'
import { type Root as MdastRoot, type PhrasingContent } from 'mdast'
import {
	type MdxJsxAttribute,
	type MdxJsxFlowElement,
} from 'mdast-util-mdx-jsx'
import { bundleMDX } from 'mdx-bundler'
import PQueue from 'p-queue'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import emoji from 'remark-emoji'
import gfm from 'remark-gfm'
import { type PluggableList } from 'unified'
import { visit } from 'unist-util-visit'
import { z } from 'zod'
import {
	cachified,
	compiledInstructionMarkdownCache,
	compiledMarkdownCache,
	shouldForceFresh,
} from './cache.server.ts'
import { type Timings } from './timing.server.ts'
import { checkConnection } from './utils.server.ts'

type MermaidTheme = 'dark' | 'default'

const themeCookieName = 'EpicShop_theme'
const themeHintCookieName = 'EpicShop_CH-prefers-color-scheme'
const CompiledInstructionMarkdownSchema = z.object({
	code: z.string(),
	title: z.string().nullable(),
	epicVideoEmbeds: z.array(z.string()),
})

function getMermaidTheme(request?: Request): MermaidTheme {
	if (!request) return 'default'
	const cookieHeader = request.headers.get('cookie')
	if (!cookieHeader) return 'default'
	const parsed = cookie.parse(cookieHeader)
	const themeCookie = parsed[themeCookieName]
	if (themeCookie === 'dark') return 'dark'
	if (themeCookie === 'light') return 'default'
	const hintTheme = parsed[themeHintCookieName]
	return hintTheme === 'dark' ? 'dark' : 'default'
}

function mdxStringExpressionAttribute(
	name: string,
	value: string,
): MdxJsxAttribute {
	return {
		type: 'mdxJsxAttribute',
		name,
		value: {
			type: 'mdxJsxAttributeValueExpression',
			value: JSON.stringify(value),
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
								type: 'Literal',
								value,
							},
						},
					],
				},
			},
		},
	}
}

function remarkMermaidCodeToSvg({ theme }: { theme: MermaidTheme }) {
	return async (tree: MdastRoot) => {
		const promises: Array<Promise<void>> = []
		visit(tree, 'code', (node, index, parent) => {
			if (node.lang === 'mermaid' && parent && typeof index === 'number') {
				const promise = (async () => {
					const isConnected = await checkConnection()
					if (isConnected) {
						const compressed = lz.compressToEncodedURIComponent(node.value)
						const url = new URL(
							'https://mermaid-to-svg.kentcdodds.workers.dev/svg',
						)
						url.searchParams.set('mermaid', compressed)
						url.searchParams.set('theme', theme)

						const timeout = AbortSignal.timeout(5000)
						const svgResponse = await fetch(url, {
							signal: timeout,
						}).catch(() => null)
						if (svgResponse?.ok) {
							const svgText = await svgResponse.text()
							if (svgText) {
								const attributes: Array<MdxJsxAttribute> = [
									{
										type: 'mdxJsxAttribute',
										name: 'code',
										value: node.value,
									},
									mdxStringExpressionAttribute('svg', svgText),
									{
										type: 'mdxJsxAttribute',
										name: 'svgTheme',
										value: theme,
									},
								]
								parent.children[index] = {
									type: 'mdxJsxFlowElement',
									name: 'Mermaid',
									attributes,
									children: [],
								} satisfies MdxJsxFlowElement
								return
							}
						}
					}

					const attributes: Array<MdxJsxAttribute> = [
						{
							type: 'mdxJsxAttribute',
							name: 'code',
							value: node.value,
						},
					]
					parent.children[index] = {
						type: 'mdxJsxFlowElement',
						name: 'Mermaid',
						attributes,
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
	[rehypeAutolinkHeadings, { behavior: 'wrap' }],
	trimCodeBlocks,
	rehypeCodeBlocksShiki,
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
	const mermaidTheme = getMermaidTheme(request)
	const stat = await fs.promises
		.stat(file)
		.catch((error: unknown) => ({ error }))
	if ('error' in stat) {
		throw new Error(`File stat cannot be read: ${stat.error}`)
	}

	const key = `file:${file}:mermaid:${mermaidTheme}`
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
		checkValue: CompiledInstructionMarkdownSchema,
		getFreshValue: () => compileMdxImpl(file, { mermaidTheme }),
	})
}

async function compileMdxImpl(
	file: string,
	{ mermaidTheme }: { mermaidTheme: MermaidTheme },
): Promise<{
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
					gfm,
					[remarkMermaidCodeToSvg, { theme: mermaidTheme }],
					() => (tree: MdastRoot) => {
						visit(tree, 'heading', (node) => {
							if (title) return
							if (node.depth === 1) {
								// Extract plain text content, preserving inline code but stripping other formatting
								const extractText = (nodes: Array<PhrasingContent>): string => {
									return nodes
										.map((childNode: PhrasingContent) => {
											if (childNode.type === 'text') {
												return childNode.value
											} else if (childNode.type === 'inlineCode') {
												return `\`${childNode.value}\``
											} else if (
												childNode.type === 'strong' ||
												childNode.type === 'emphasis'
											) {
												// For formatting like bold/italic, just extract the text content
												return extractText(childNode.children || [])
											} else if (
												'children' in childNode &&
												childNode.children
											) {
												// For other nodes with children, recursively extract text
												return extractText(childNode.children || [])
											}
											return ''
										})
										.join('')
								}

								title = extractText(node.children || []).trim()
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
		key: md5(markdownString),
		cache: compiledMarkdownCache,
		ttl: 1000 * 60 * 60 * 24,
		checkValue: z.string(),
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
