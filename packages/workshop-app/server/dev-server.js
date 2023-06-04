import { execa } from 'execa'

if (process.env.NODE_ENV === 'production') {
	await import('./start.js')
} else {
	const command =
		'tsx watch --clear-screen=false --ignore "app/**" --ignore "build/**" --ignore "node_modules/**" --inspect ./start.js'
	execa(command, {
		stdio: ['ignore', 'inherit', 'inherit'],
		env: {
			...process.env,
			FORCE_COLOR: true,
		},
		// https://github.com/sindresorhus/execa/issues/433
		windowsHide: false,
	})
}
