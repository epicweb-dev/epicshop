import { type Content, type Element, type Root } from 'hast'
import { expect, test } from 'vitest'
import { rehypeInlineCodeDiff } from './rehype-inline-code-diff.server.ts'

function isElement(node: Content | Root): node is Element {
	return (node as any).type === 'element'
}

function getText(node: Content | Root): string {
	if ((node as any).type === 'text') return (node as any).value
	if (!isElement(node)) {
		return ((node as any).children ?? []).map(getText).join('')
	}
	return (node.children ?? []).map(getText).join('')
}

function findElementsByClass(root: Root, className: string): Array<Element> {
	const results: Array<Element> = []
	const visit = (node: Content | Root) => {
		if (isElement(node)) {
			const cn = node.properties?.className
			const classes =
				typeof cn === 'string'
					? cn.split(/\s+/).filter(Boolean)
					: Array.isArray(cn)
						? cn
						: []
			if (classes.includes(className)) results.push(node)
		}
		for (const child of ((node as any).children ?? []) as Array<Content>) {
			visit(child)
		}
	}
	visit(root)
	return results
}

function t(value: string): Content {
	return { type: 'text', value }
}

function token(value: string): Content {
	return {
		type: 'element',
		tagName: 'span',
		properties: { style: 'color: #82aaff' },
		children: [t(value)],
	}
}

function line({
	type,
	children,
}: {
	type: 'add' | 'remove'
	children: Array<Content>
}): Element {
	return {
		type: 'element',
		tagName: 'span',
		properties: {
			className: 'codeblock-line',
			dataAdd: type === 'add' ? true : undefined,
			dataRemove: type === 'remove' ? true : undefined,
		},
		children: [...children, t('\n')],
	}
}

function makeTree(lines: Array<Element>): Root {
	return {
		type: 'root',
		children: [
			{
				type: 'element',
				tagName: 'pre',
				properties: { 'data-add': '1', 'data-remove': '1' },
				children: [
					{
						type: 'element',
						tagName: 'code',
						properties: {},
						children: lines,
					},
				],
			},
		],
	}
}

test('wraps removed character ranges when lines are nearly identical', () => {
	const tree = makeTree([
		line({
			type: 'remove',
			children: [
				t("console.log('"),
				token('poopstate'),
				t(" event listener called')"),
			],
		}),
		line({
			type: 'add',
			children: [
				t("console.log('"),
				token('popstate'),
				t(" event listener called')"),
			],
		}),
	])

	rehypeInlineCodeDiff()(tree)

	const removed = findElementsByClass(tree, 'diff-inline-remove')
	expect(removed).toHaveLength(1)
	expect(getText(removed[0]!)).toBe('o')

	const added = findElementsByClass(tree, 'diff-inline-add')
	expect(added).toHaveLength(0)
})

test('wraps replacement ranges for paired removed/added lines', () => {
	const tree = makeTree([
		line({
			type: 'remove',
			children: [t('const '), token('foo'), t(' = 1')],
		}),
		line({
			type: 'add',
			children: [t('const '), token('bar'), t(' = 1')],
		}),
	])

	rehypeInlineCodeDiff()(tree)

	const removed = findElementsByClass(tree, 'diff-inline-remove')
	expect(removed).toHaveLength(1)
	expect(getText(removed[0]!)).toBe('foo')

	const added = findElementsByClass(tree, 'diff-inline-add')
	expect(added).toHaveLength(1)
	expect(getText(added[0]!)).toBe('bar')
})

