// This should run by node without any dependencies
// because you may need to run it without deps.

import fs from 'fs'
import path from 'path'

async function exists(dir) {
	return Boolean(await fs.promises.stat(dir).catch(() => false))
}

async function readDir(dir) {
	if (await exists(dir)) {
		return fs.promises.readdir(dir)
	}
	return []
}

const __dirname = new URL('.', import.meta.url).pathname
const here = (...p) => path.join(__dirname, ...p)

const workshopRoot = here('..')
const examples = (await readDir(here('../examples'))).map(dir =>
	here(`../examples/${dir}`),
)
const exercises = await readDir(here('../exercises'))
const apps = (
	await Promise.all([
		...(
			await readDir(here('../examples'))
		).map(dir => here(`../examples/${dir}`)),
		...exercises.flatMap(async exercise => {
			return (await readDir(here(`../exercises/${exercise}`)))
				.filter(dir => {
					return /^(problem|solution)/.test(dir)
				})
				.map(dir => here(`../exercises/${exercise}/${dir}`))
		}),
	])
).flat()

// update the package.json file name property
// to match the parent directory name + directory name
// e.g. exercises/01-goo/problem.01-great
// name: "exercises.01-goo.problem.01-great"

const relativeToWorkshopRoot = dir => dir.replace(`${workshopRoot}/`, '')

const files = [...examples, ...apps]
for (const file of files) {
	const pkgjsonPath = path.join(file, 'package.json')
	const pkg = JSON.parse(await fs.promises.readFile(pkgjsonPath, 'utf8'))
	pkg.name = relativeToWorkshopRoot(file).replace(/\//g, '.')
	await fs.promises.writeFile(pkgjsonPath, JSON.stringify(pkg, null, 2))
}

const tsconfig = {
	files: [],
	exclude: ['node_modules'],
	references: apps.map(a => ({ path: relativeToWorkshopRoot(a) })),
}
await fs.promises.writeFile(
	path.join(workshopRoot, 'tsconfig.json'),
	JSON.stringify(tsconfig, null, 2),
	{ parser: 'json' },
)
