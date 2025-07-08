import { execa } from 'execa'

if (process.env.NODE_ENV === 'production') {
	await import('../start.js')
} else {
	const parentImports = process.argv
		.filter((arg) => arg.startsWith('--import'))
		.join(' ')
	const command = `tsx watch --clear-screen=false --ignore ".cache/**" --ignore "app/**" --ignore "vite.config.ts.timestamp-*" --ignore "build/**" --ignore "dist/**" --ignore "node_modules/**" --inspect=0 ${parentImports} ./start.js`

	execa(command, {
		stdio: ['ignore', 'inherit', 'inherit'],
		shell: true,
		env: {
			...process.env,
			FORCE_COLOR: true,
		},
		// https://github.com/sindresorhus/execa/issues/433
		windowsHide: false,
	})
}
