import fs from 'fs'
import fsExtra from 'fs-extra'
import path from 'path'
import { bundleMDX } from 'mdx-bundler'
import type * as U from 'unified'
import type * as H from 'hast'
import type * as M from 'mdast'
import { remarkCodeBlocksShiki } from '@kentcdodds/md-temp'

const cacheDir = path.join(
	process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(),
	'./node_modules/.cache/compile-mdx',
)

function trimCodeBlocks() {
	return async function transformer(tree: H.Root) {
		const { visit } = await import('unist-util-visit')
		visit(tree, 'element', (preNode: H.Element) => {
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
			codeStringNode.value = codeStringNode.value.trim()
		})
	}
}

function removePreContainerDivs() {
	return async function preContainerDivsTransformer(tree: H.Root) {
		const { visit } = await import('unist-util-visit')
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

const rehypePlugins: U.PluggableList = [
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

export async function compileMdx<
	FrontmatterType extends Record<string, unknown>,
>(file: string) {
	if (!(await checkFileExists(file))) {
		throw new Error(`File does not exist: ${file}`)
	}
	const { default: md5 } = await import('md5-hex')
	const cacheLocation = path.join(cacheDir, `${md5(file)}.json`)
	const stat = await fs.promises.stat(file)

	if (await checkFileExists(cacheLocation)) {
		const cached = require(cacheLocation)
		if (cached) {
			if (cached.mtimeMs === stat.mtimeMs) {
				return cached.value
			}
		}
	}
	const [{ default: remarkAutolinkHeadings }, { default: gfm }, { visit }] =
		await Promise.all([
			import('remark-autolink-headings'),
			import('remark-gfm'),
			import('unist-util-visit'),
		])
	let title: string | null = null

	try {
		const { frontmatter, code } = await bundleMDX({
			file,
			cwd: path.dirname(file),
			mdxOptions(options) {
				options.remarkPlugins = [
					...(options.remarkPlugins ?? []),
					[remarkAutolinkHeadings, { behavior: 'wrap' }],
					gfm,
					() => (tree: M.Root) => {
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

		const result = {
			code,
			title,
			frontmatter: frontmatter as FrontmatterType,
		}
		await fsExtra.ensureDir(cacheDir)
		await fs.promises.writeFile(
			cacheLocation,
			JSON.stringify({ mtimeMs: stat.mtimeMs, value: result }),
		)
		return result
	} catch (error: unknown) {
		console.error(`Compilation error for file: `, file, error)
		throw error
	}
}
