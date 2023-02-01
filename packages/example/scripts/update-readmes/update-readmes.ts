import path from 'path'
import fs from 'fs'
import glob from 'glob'

glob
	.sync('exercise/**/README.md', { ignore: ['**/node_modules/**'] })
	.forEach(async filepath => {
		const fullFilepath = path.join(process.cwd(), filepath)
		let contents = fs.readFileSync(fullFilepath, {
			encoding: 'utf-8',
		})

		const finals = glob.sync(
			`final/${path.basename(path.dirname(filepath))}*/README.md`,
		)
		for (const final of finals) {
			const currentContents = fs.readFileSync(final, {
				encoding: 'utf-8',
			})
			if (currentContents !== contents) {
				fs.writeFileSync(final, contents)
			}
		}
	})
