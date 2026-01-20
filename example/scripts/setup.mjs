import { spawnSync } from 'child_process'

const styles = {
	// got these from playing around with what I found from:
	// https://github.com/istanbuljs/istanbuljs/blob/0f328fd0896417ccb2085f4b7888dd8e167ba3fa/packages/istanbul-lib-report/lib/file-writer.js#L84-L96
	// they're the best I could find that works well for light or dark terminals
	success: { open: '\u001b[32;1m', close: '\u001b[0m' },
	danger: { open: '\u001b[31;1m', close: '\u001b[0m' },
	info: { open: '\u001b[36;1m', close: '\u001b[0m' },
	subtitle: { open: '\u001b[2;1m', close: '\u001b[0m' },
}

function color(modifier, string) {
	return styles[modifier].open + string + styles[modifier].close
}

console.log(color('info', '▶️  Starting workshop setup...'))

const userAgent = (process.env.npm_config_user_agent ?? '').toLowerCase()
const packageManager = userAgent.includes('pnpm')
	? 'pnpm'
	: userAgent.includes('yarn')
		? 'yarn'
		: userAgent.includes('bun')
			? 'bun'
			: 'npm'

const command =
	packageManager === 'pnpm'
		? 'pnpm dlx epicshop setup'
		: packageManager === 'yarn'
			? 'yarn dlx epicshop setup'
			: packageManager === 'bun'
				? 'bunx epicshop setup'
				: 'npx --yes epicshop setup'
console.log(
	color('subtitle', '      Running the following command: ' + command),
)

const result = spawnSync(command, { stdio: 'inherit', shell: true })

if (result.status === 0) {
	console.log(color('success', '✅  Workshop setup complete...'))
} else {
	process.exit(result.status)
}

/*
eslint
  "no-undef": "off",
  "vars-on-top": "off",
*/
