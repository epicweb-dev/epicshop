import { type Content, type Element, type Root } from 'hast'
import { visit } from 'unist-util-visit'

type TextRange = { start: number; end: number }

function isElement(node: Content): node is Element {
	return node.type === 'element'
}

function getClassName(node: Element): Array<string> {
	const className = node.properties?.className
	if (!className) return []
	if (Array.isArray(className)) return className.filter((c) => typeof c === 'string')
	if (typeof className === 'string') return className.split(/\s+/).filter(Boolean)
	return []
}

function hasClass(node: Element, className: string) {
	return getClassName(node).includes(className)
}

function getNodeText(node: Content): string {
	if (node.type === 'text') return node.value
	if (!isElement(node)) return ''
	return (node.children ?? []).map(getNodeText).join('')
}

function getLineText(lineNode: Element): string {
	const text = (lineNode.children ?? []).map(getNodeText).join('')
	return text.endsWith('\n') ? text.slice(0, -1) : text
}

function normalizeRanges(ranges: Array<TextRange>, maxLen: number) {
	const filtered = ranges
		.map((r) => ({
			start: Math.max(0, Math.min(maxLen, r.start)),
			end: Math.max(0, Math.min(maxLen, r.end)),
		}))
		.filter((r) => r.end > r.start)
		.sort((a, b) => a.start - b.start)

	const merged: Array<TextRange> = []
	for (const range of filtered) {
		const last = merged.at(-1)
		if (!last) {
			merged.push(range)
			continue
		}
		if (range.start <= last.end) {
			last.end = Math.max(last.end, range.end)
		} else {
			merged.push(range)
		}
	}
	return merged
}

function computeInlineDiffRanges(
	removedLineText: string,
	addedLineText: string,
): { removeRanges: Array<TextRange>; addRanges: Array<TextRange> } | null {
	if (removedLineText === addedLineText) return null

	const a = removedLineText
	const b = addedLineText
	const aLen = a.length
	const bLen = b.length
	const minLen = Math.min(aLen, bLen)

	let prefixLen = 0
	while (prefixLen < minLen && a[prefixLen] === b[prefixLen]) {
		prefixLen++
	}

	let suffixLen = 0
	while (
		suffixLen < aLen - prefixLen &&
		suffixLen < bLen - prefixLen &&
		a[aLen - 1 - suffixLen] === b[bLen - 1 - suffixLen]
	) {
		suffixLen++
	}

	// No shared context: inline highlights usually add noise.
	if (prefixLen === 0 && suffixLen === 0) return null

	const removeStart = prefixLen
	const removeEnd = aLen - suffixLen
	const addStart = prefixLen
	const addEnd = bLen - suffixLen

	const removeLen = Math.max(0, removeEnd - removeStart)
	const addLen = Math.max(0, addEnd - addStart)
	const maxLen = Math.max(aLen, bLen)
	const changedMax = Math.max(removeLen, addLen)

	// If the "changed" portion is huge, line-level highlight is clearer.
	if (maxLen === 0) return null
	if (changedMax > 120) return null
	if (changedMax / maxLen > 0.6) return null

	const removeRanges = removeLen ? [{ start: removeStart, end: removeEnd }] : []
	const addRanges = addLen ? [{ start: addStart, end: addEnd }] : []

	if (!removeRanges.length && !addRanges.length) return null
	return { removeRanges, addRanges }
}

function cloneNodeWithText(node: Content, text: string): Content {
	if (node.type === 'text') return { type: 'text', value: text }
	if (isElement(node)) {
		return {
			...node,
			properties: { ...(node.properties ?? {}) },
			children: [{ type: 'text', value: text }],
		}
	}
	return node
}

function wrapInlineDiff(node: Content, className: string): Element {
	return {
		type: 'element',
		tagName: 'span',
		properties: { className },
		children: [node],
	}
}

function wrapRangesInLine(
	lineNode: Element,
	ranges: Array<TextRange>,
	wrapperClassName: string,
) {
	if (!ranges.length) return
	if (!lineNode.children?.length) return

	// If we already wrapped this line, avoid duplicating work (and nesting spans).
	const alreadyWrapped = lineNode.children.some(
		(c) =>
			isElement(c) &&
			(hasClass(c, 'diff-inline-add') || hasClass(c, 'diff-inline-remove')),
	)
	if (alreadyWrapped) return

	const children = [...lineNode.children]
	const newline =
		children.at(-1)?.type === 'text' && children.at(-1)?.value === '\n'
			? (children.pop() as Content)
			: null

	const lineText = children.map(getNodeText).join('')
	const normalized = normalizeRanges(ranges, lineText.length)
	if (!normalized.length) return

	let rangeIndex = 0
	let pos = 0
	const newChildren: Array<Content> = []

	for (const child of children) {
		const childText = getNodeText(child)
		const childLen = childText.length
		if (childLen === 0) {
			newChildren.push(child)
			continue
		}

		const childStart = pos
		const childEnd = pos + childLen
		let cursor = 0

		while (rangeIndex < normalized.length && normalized[rangeIndex]!.start < childEnd) {
			const range = normalized[rangeIndex]!
			if (range.end <= childStart) {
				rangeIndex++
				continue
			}

			const startInChild = Math.max(range.start - childStart, 0)
			const endInChild = Math.min(range.end - childStart, childLen)

			if (startInChild > cursor) {
				newChildren.push(
					cloneNodeWithText(child, childText.slice(cursor, startInChild)),
				)
			}

			if (endInChild > startInChild) {
				const inside = cloneNodeWithText(
					child,
					childText.slice(startInChild, endInChild),
				)
				newChildren.push(wrapInlineDiff(inside, wrapperClassName))
			}

			cursor = endInChild

			// If the range extends past this token, keep it active for the next token.
			if (range.end <= childEnd) {
				rangeIndex++
			} else {
				break
			}
		}

		if (cursor < childLen) {
			newChildren.push(cloneNodeWithText(child, childText.slice(cursor)))
		}

		pos = childEnd
	}

	if (newline) newChildren.push(newline)
	lineNode.children = newChildren
}

function isDiffRemoveLine(lineNode: Element) {
	return lineNode.properties?.dataRemove === true
}

function isDiffAddLine(lineNode: Element) {
	return lineNode.properties?.dataAdd === true
}

function findFirstCodeChild(preNode: Element): Element | null {
	for (const child of preNode.children ?? []) {
		if (!isElement(child)) continue
		if (child.tagName === 'code') return child
	}
	return null
}

function getCodeblockLines(codeNode: Element): Array<Element> {
	const lines: Array<Element> = []
	for (const child of codeNode.children ?? []) {
		if (!isElement(child)) continue
		if (child.tagName !== 'span') continue
		if (!hasClass(child, 'codeblock-line')) continue
		lines.push(child)
	}
	return lines
}

export function rehypeInlineCodeDiff() {
	return function rehypeInlineCodeDiffTransformer(tree: Root) {
		visit(tree, 'element', (node) => {
			if (node.tagName !== 'pre') return
			const props = node.properties ?? {}
			if (!('data-add' in props || 'data-remove' in props)) return

			const codeNode = findFirstCodeChild(node)
			if (!codeNode) return

			const lineNodes = getCodeblockLines(codeNode)
			if (!lineNodes.length) return

			let i = 0
			while (i < lineNodes.length) {
				if (!isDiffRemoveLine(lineNodes[i]!)) {
					i++
					continue
				}

				const removedLines: Array<Element> = []
				while (i < lineNodes.length && isDiffRemoveLine(lineNodes[i]!)) {
					removedLines.push(lineNodes[i]!)
					i++
				}

				const addedLines: Array<Element> = []
				while (i < lineNodes.length && isDiffAddLine(lineNodes[i]!)) {
					addedLines.push(lineNodes[i]!)
					i++
				}

				if (!addedLines.length) continue

				const pairCount = Math.min(removedLines.length, addedLines.length)
				for (let j = 0; j < pairCount; j++) {
					const removedLine = removedLines[j]!
					const addedLine = addedLines[j]!
					const removedText = getLineText(removedLine)
					const addedText = getLineText(addedLine)
					const ranges = computeInlineDiffRanges(removedText, addedText)
					if (!ranges) continue

					wrapRangesInLine(removedLine, ranges.removeRanges, 'diff-inline-remove')
					wrapRangesInLine(addedLine, ranges.addRanges, 'diff-inline-add')
				}
			}
		})
	}
}

