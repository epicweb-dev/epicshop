import fs from 'node:fs'
import path from 'node:path'
import { createProcessor } from '@mdx-js/mdx'
import md5 from 'md5-hex'
import { type RootContent, type Root as MdastRoot, type Parent } from 'mdast'
import {
	type MdxJsxAttribute,
	type MdxJsxFlowElement,
} from 'mdast-util-mdx-jsx'
import { removePosition } from 'unist-util-remove-position'
import { type Visitor, visit } from 'unist-util-visit'
import * as z from 'zod'

type CodeFile = {
	node: MdxJsxFlowElement
	parent: Parent | null | undefined
}

type RangeArray = [number, number][] | undefined

type CodeFileProps = Record<string, unknown>

type PathContentMap = Map<string, string[]>

const APP_TYPES = ['problem', 'solution', 'playground'] as const
type AppTypes = typeof APP_TYPES

export type EmbeddedFile = {
	error?: boolean
	file: string
	hash: string
	line?: number
	warning?: string
}

export type CodeFileData = {
	mdxFile: string
	cacheLocation: string
	cachedEmbeddedFiles: Map<string, EmbeddedFile>
	embeddedFiles: Map<string, EmbeddedFile>
}

const safePath = (s: string) => s.replace(/\\/g, '/')

const REG_EXP = /^(?:\d+(?:-\d+)?,)*\d+(?:-\d+)?$/

const isValidRangeFormat = (value: string | undefined) =>
	value ? REG_EXP.test(value) : true

const transformRange = (value: string | undefined) =>
	value?.split(',').map(range => {
		const [start, end] = range.split('-').map(Number)
		return [start, end ?? start] as [number, number]
	})

const isRangeBounded = (
	range: RangeArray,
	ctx: z.RefinementCtx,
	lines: number,
) => {
	if (!lines || !Array.isArray(range)) return
	if (range.flat().some(r => r < 1 || r > lines)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Range must be between 1 and ${lines}`,
		})
	}
}

const isRangeInOrder = (range: RangeArray) =>
	Array.isArray(range)
		? range.every(([a, b]) => !isNaN(Number(a)) && !isNaN(Number(b)) && b >= a)
		: true

const isRangesNonOverlapping = (range: RangeArray) => {
	if (!Array.isArray(range)) return true
	return range.every(([a], i) => i === 0 || (range[i - 1]?.[1] ?? 0) < a)
}

let fileContentCache: PathContentMap = new Map()
async function getFileContent(filePath: string) {
	if (fileContentCache.has(filePath)) {
		return fileContentCache.get(filePath)
	}
	try {
		const content = await fs.promises.readFile(filePath, 'utf-8')
		const fileContent = content.split('\n')
		fileContentCache.set(filePath, fileContent)
		return fileContent
	} catch (error) {
		console.warn(
			`@epic-web/workshop-app - invalid CodeFile.\nCould not read file: ${filePath}\n`,
		)
	}
}

async function validateProps(props: CodeFileProps, appDir: string) {
	let validRange: RangeArray
	let linesCount = 0

	const BooleanSchema = z
		.nullable(z.string())
		.optional()
		.refine(
			v => ['true', 'false', null, undefined].includes(v),
			'optional boolean key can be "true", "false", null or undefined',
		)
		.transform(v => v === null || Boolean(v))

	const RangeSchema = z
		.string()
		.optional()
		.refine(isValidRangeFormat, 'Invalid range format')
		.transform(transformRange)
		.superRefine((val, ctx) => isRangeBounded(val, ctx, linesCount))
		.refine(isRangeInOrder, 'Range must be in order low-high')

	const inputSchema = z
		.object({
			file: z
				.string()
				.nonempty()
				.transform(async (file, ctx) => {
					const fullPath = path.join(appDir, file)
					const content = await getFileContent(fullPath)
					if (!content) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: `Could not read file`,
							fatal: true,
						})
						return z.NEVER
					}
					linesCount = content.length
					// @mdx-js/mdx parser can NOT handle relative path with backslashes
					return {
						fullPath: safePath(fullPath),
						filePath: safePath(file),
						content,
					}
				}),
			range: RangeSchema.refine(range => {
				const isValid = isRangesNonOverlapping(range)
				// we use this value in highlight refine
				validRange = isValid ? range : undefined
				return isValid
			}, 'Ranges must not overlap'),
			highlight: RangeSchema.refine(highlight => {
				if (!Array.isArray(highlight) || !Array.isArray(validRange)) {
					return z.NEVER
				}
				return highlight.every(([hStart, hEnd]) =>
					validRange?.some(
						([rStart, rEnd]) => hStart >= rStart && hEnd <= rEnd,
					),
				)
			}, 'Highlight range must be within defined range')
				.transform(() => props.highlight as Array<string>)
				.optional(),
			nonumber: BooleanSchema,
			nocopy: BooleanSchema,
			buttons: z
				.string()
				.optional()
				.transform(str => (str ? (str.split(',') as unknown as AppTypes) : []))
				.refine(arr => arr.every(item => APP_TYPES.includes(item)), {
					message: `Buttons can only be any of ${APP_TYPES.join(',')}`,
				}),
		})
		.strict()

	return inputSchema.safeParseAsync(props)
}

async function createErrorNotification(
	node: MdxJsxFlowElement,
	errors: string[],
	mdxFile: string,
	appType: string,
) {
	const filename = path.basename(mdxFile)
	const startLine = node.position?.start.line
	const endLine = node.position?.end.line

	const codeFence = async () => {
		if (startLine && endLine) {
			const contentStr = await getFileContent(mdxFile)
			const content = contentStr?.slice(startLine - 1, endLine).join('\n')
			if (content) {
				return `
\`\`\`tsx filename=${filename} start=${startLine} nocopy
${content}
\`\`\``.trim()
			}
		}
		return ''
	}

	const mdxSource = `
<CodeFileNotification variant="error" file="${filename}" line="${startLine}" type="${appType}">
  <callout-danger class="notification">
    <div className="title">CodeFile Error: invalid input</div>
    ${errors.map(error => `<div>${error}</div>`).join('')}
${await codeFence()}
  </callout-danger>
</CodeFileNotification>`

	return mdxToMdast(mdxSource)
}

// based on https://github.com/sindresorhus/strip-indent
function stripIndent(string: string) {
	const match = string.match(/^[ \t]*(?=\S)/gm)
	const indent = match?.reduce((r, a) => Math.min(r, a.length), Infinity) ?? 0
	if (indent === 0) {
		return string
	}
	const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm')
	return string.replace(regex, '')
}

function mdxToMdast(mdx: string) {
	const processor = createProcessor()
	const mdast = processor.parse(mdx.trim()) as MdastRoot | RootContent
	removePosition(mdast, { force: true })
	return mdast.type === 'root' ? mdast.children : [mdast]
}

export function remarkCodeFile(data: CodeFileData) {
	fileContentCache = new Map()
	const mdxFile = data.mdxFile
	const appDir = path.dirname(mdxFile)
	const appType = mdxFile.includes('problem')
		? 'problem'
		: mdxFile.includes('solution')
			? 'solution'
			: 'other' // not in exercise

	async function replaceCodeFileNode({
		node,
		parent,
	}: CodeFile): Promise<void> {
		if (!parent) {
			console.warn(
				'Unexpected error: replaceCodeFileNode called without a Parent',
			)
			return
		}
		const index = parent.children.indexOf(node)
		if (index === -1) {
			console.warn(
				'Unexpected error: replaceCodeFileNode could not find node index in Parent',
			)
			return
		}
		const attributes = node.attributes as MdxJsxAttribute[]
		const props: CodeFileProps = {}
		for (const { name, value } of attributes) {
			props[name] = value
		}

		const result = await validateProps(props, appDir)
		if (!result.success) {
			const errors = result.error.issues.map(({ message, path }) =>
				path[0] ? `${message}: ${path[0]}="${props[path[0]]}"` : message,
			)
			const notification = await createErrorNotification(
				node,
				errors,
				mdxFile,
				appType,
			)
			parent.children.splice(index, 1, ...notification)

			data.embeddedFiles.set('invalid input', {
				error: true,
				file: props.file as string,
				hash: '',
				line: node.position?.start.line ?? 1,
			})
			return
		}

		const {
			file: { content, filePath, fullPath },
			highlight,
			range,
		} = result.data
		const language = path.extname(filePath).substring(1)
		const meta = [`filename=${filePath}`]

		// nonumbers nocopy ....
		Object.entries(result.data).forEach(
			([key, val]) =>
				typeof val === 'boolean' && val && meta.push(`${key}=true`),
		)

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (result.data.buttons) {
			meta.push(`buttons=${result.data.buttons.join(',')}`)
			meta.push(`type=${appType}`)
			meta.push(`fullpath=${fullPath}`)
			// Avoid the headache of finding the separator on the client side
			// path.sep is always / on client side
			meta.push(`sep=${path.sep}`)
		}

		if (highlight?.length) {
			meta.push(`lines=${highlight}`)
		}

		const fileSections = range?.length ? range : [[1, content.length]]
		const rangesContent = []
		const preNodes = []
		for (const [start, end] of fileSections) {
			const rangeContent = stripIndent(
				content.slice(start ? start - 1 : 0, end).join('\n'),
			)
			rangesContent.push(rangeContent)
			const mdxSource = `
\`\`\`${language} ${meta.concat(`start=${start}`).join(' ')}
${rangeContent}
\`\`\``
			preNodes.push(...mdxToMdast(mdxSource))
		}

		/**
		 * Show a warning above the file content if the range we show changed in the
		 * embedded file and the range in <CodeFile range="a-b"> did not change.
		 * The warning will be removed automatically after the <CodeFile> range changes
		 * or by canceling it from the UI.
		 */
		const embeddedKey = md5(fullPath + JSON.stringify(range))
		const contentHash = md5(rangesContent.join(','))
		const newData: EmbeddedFile = {
			file: fullPath,
			hash: contentHash,
		}
		const cachedData = data.cachedEmbeddedFiles.get(embeddedKey)

		if (
			cachedData &&
			// If a warning existed previously and its hash matched the current hash,
			// then the changes were reverted and the warning will be remove
			((cachedData.warning && cachedData.warning !== contentHash) ??
				(!cachedData.warning && cachedData.hash !== contentHash))
		) {
			// keep previously saved warning or previous hash
			newData.warning = cachedData.warning ?? cachedData.hash
			const startLine = node.position?.start.line ?? 1
			newData.line = startLine
			const mdxFilename = path.basename(mdxFile)
			const filename = path.basename(filePath)
			const warning = `
<CodeFileNotification variant="warning" file="${mdxFilename}" line="${startLine}" type="${appType}"
cacheLocation="${data.cacheLocation}" embeddedKey="${embeddedKey}">
  <callout-warning class="notification">
    <div className="title">CodeFile Warning:</div>
    <div>file ${filename} content was changed, review 'range' and 'highlight' inputs</div>
  </callout-warning>
</CodeFileNotification>`
			preNodes.unshift(...mdxToMdast(warning))
		}
		data.embeddedFiles.set(embeddedKey, newData)

		// replace <CodeFile> with embedded file content
		parent.children.splice(index, 1, ...preNodes)
	}

	return async function codeFileTransformer(tree: MdastRoot) {
		const codeFiles: CodeFile[] = []
		const filter = { type: 'mdxJsxFlowElement', name: 'CodeFile' } as const
		visit<MdastRoot, typeof filter>(tree, filter, ((node, _index, parent) => {
			codeFiles.push({ node, parent })
		}) as Visitor<MdxJsxFlowElement, Parent>)

		for (const props of codeFiles) {
			await replaceCodeFileNode(props)
		}

		// cleanup
		fileContentCache = new Map()
	}
}
