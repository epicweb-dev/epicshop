import path from 'path'
import { type getDiffFiles } from './diff.server'
import prettier from 'prettier'
import { getWorkshopRoot } from './apps.server'

// mostly moved this to its own file because unifieds types are
// pretty nuts and makes in-editor TypeScript very slow 😅
export async function updateFilesSection(
	readme: string,
	files: Awaited<ReturnType<typeof getDiffFiles>>,
	cwd: string,
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
	let filesIndex = -1
	visit(ast, 'heading', (node, index) => {
		if (index === null) return
		if (filesIndex !== -1) return
		if (node.depth === 2) {
			visit(node, 'text', textNode => {
				if (textNode.value === 'Files' || textNode.value === 'Files 🗃') {
					filesIndex = index
				}
			})
		}
	})

	if (filesIndex === -1) {
		// add a Files heading to the end of the readme
		const headingAst = fromMarkdown('## Files 🗃', {
			extensions: [mdxjs()],
			mdastExtensions: [mdxFromMarkdown()],
		})
		const heading = headingAst.children[0]
		if (!heading) {
			throw new Error(`Somehow, the heading is empty?`)
		}
		ast.children.push(heading)
		filesIndex = ast.children.length - 1
	}

	const workshopRoot = await getWorkshopRoot()

	const filesMarkdown = files.length
		? files
				.map(file => {
					return `<li className="flex gap-2"><span>${
						file.status
					}:</span><LaunchEditor workshopFile=${JSON.stringify(
						path.join(cwd, file.path).replace(`${workshopRoot}/`, ''),
					)}>\`${file.path}\`</LaunchEditor></li>`
				})
				.join('\n')
		: '<li>No files changed</li>'
	const filesAst = fromMarkdown(`<ul>${filesMarkdown}</ul>`, {
		extensions: [mdxjs()],
		mdastExtensions: [mdxFromMarkdown()],
	})
	const list = filesAst.children[0]
	if (!list) {
		throw new Error(`Somehow, the list is empty? ${filesMarkdown}`)
	}

	const nextEl = ast.children[filesIndex + 1]
	const listExistsAlready =
		nextEl && nextEl.type === 'mdxJsxFlowElement' && nextEl.name === 'ul'
	ast.children.splice(filesIndex + 1, listExistsAlready ? 1 : 0, list)

	const newReadme = toMarkdown(ast, {
		extensions: [mdxToMarkdown()],
	})
	return prettier.format(newReadme, { parser: 'mdx' })
}
