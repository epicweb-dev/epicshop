import { promises as dns } from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'

export async function checkConnection() {
	return dns.resolve('example.com').then(
		() => true,
		() => false,
	)
}

export async function getPkgProp<Value>(
	fullPath: string,
	prop: string,
	defaultValue?: Value,
): Promise<Value> {
	const pkg = JSON.parse(
		fs.readFileSync(path.join(fullPath, 'package.json')).toString(),
	) as any
	const propPath = prop.split('.')
	let value = pkg
	for (const p of propPath) {
		value = value[p]
		if (value === undefined) break
	}
	if (value === undefined && defaultValue === undefined) {
		throw new Error(
			`Could not find required property ${prop} in package.json of ${fullPath}`,
		)
	}
	return value ?? defaultValue
}
