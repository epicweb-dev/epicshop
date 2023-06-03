import path from 'path'
import fs from 'fs'

// remix using `esbuild-plugin-polyfill-node` plugin
// this plugin report that we can not use "esbuild",
// because esbuild require("worker_threads") which use top-level await
// since we are using node18+ we can use top-level await in our code
// using esbuild in a .server file solved this issue
import * as esbuild from 'esbuild'

export async function compileTs(filePath: string, fullPath: string) {
	return esbuild.build({
		stdin: {
			contents: await fs.promises.readFile(filePath, 'utf-8'),
			// NOTE: if the fileAppName is specified, then we're resolving to a different
			// app than the one we're serving the file from. We do this so the tests
			// can live in the solution directory, but be run against the problem
			resolveDir: fullPath,
			sourcefile: path.basename(filePath),
			loader: 'tsx',
		},
		define: {
			'process.env': JSON.stringify({ NODE_ENV: 'development' }),
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		jsx: 'automatic',
		minify: false,
		sourcemap: 'inline',
	})
}
