import { type getDiffFiles } from './diff.server'
import prettier from 'prettier'
import { getWorkshopRoot } from './apps.server'

// mostly moved this to its own file because unifieds types are
// pretty nuts and makes in-editor TypeScript very slow 😅
export async function updateFilesSection(
	readme: string,
	files: Awaited<ReturnType<typeof getDiffFiles>>,
) {
	const [
		{ fromMarkdown },
		{ toMarkdown },
		{ visit },
		{ mdxjs },
		{ mdxFromMarkdown, mdxToMarkdown },
	] = await Promise.all([
		import('mdast-util-from-markdown'),
		import('mdast-util-to-markdown'),
		import('unist-util-visit'),
		import('micromark-extension-mdxjs'),
		import('mdast-util-mdx'),
	])
	const ast = fromMarkdown(readme, {
		extensions: [mdxjs()],
		mdastExtensions: [mdxFromMarkdown()],
	})
	let filesSectionIndex = -1
	visit(ast, 'mdxJsxFlowElement', (node, index) => {
		if (index === null) return
		if (filesSectionIndex !== -1) return
		if (
			node.name === 'section' &&
			node.attributes.find(
				a =>
					a.type === 'mdxJsxAttribute' &&
					a.name === 'id' &&
					a.value === 'files',
			)
		) {
			filesSectionIndex = index
		}
	})

	const workshopRoot = await getWorkshopRoot()

	function getLiForFile(file: (typeof files)[0]) {
		return /* html */ `
			<li data-state="${file.status}">
				<span>${file.status}</span>
				<InlineFile file=${JSON.stringify(file.path)} />
			</li>
		`.trim()
	}

	const filesJxs = /* html */ `
<section id="files" className="not-prose">
	<h2>Files</h2>
	${
		files.length
			? `<ul>${files.map(getLiForFile).join('\n')}</ul>`
			: '<p>No files changed</p>'
	}
</section>
	`

	const filesAst = fromMarkdown(filesJxs, {
		extensions: [mdxjs()],
		mdastExtensions: [mdxFromMarkdown()],
	})
	const filesSectionAst = filesAst.children[0]
	if (!filesSectionAst) {
		throw new Error(`Somehow, the filesSection is empty? ${filesJxs}`)
	}

	if (filesSectionIndex === -1) {
		ast.children.push(filesSectionAst)
	} else {
		ast.children[filesSectionIndex] = filesSectionAst
	}

	const newReadme = toMarkdown(ast, {
		extensions: [mdxToMarkdown()],
	})

	const config = await prettier.resolveConfig(workshopRoot)
	return prettier.format(newReadme, { ...config, parser: 'mdx' })
}
