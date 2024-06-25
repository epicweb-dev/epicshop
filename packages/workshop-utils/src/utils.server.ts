import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export async function checkConnection() {
	try {
		const response = await fetch('https://www.cloudflare.com', {
			method: 'HEAD',
		})
		return response.ok
	} catch {
		return false
	}
}

const PkgSchema = z.object({}).passthrough()

export async function getPkgProp<Value>(
	fullPath: string,
	prop: string,
	defaultValue?: Value,
): Promise<Value> {
	let pkg: z.infer<typeof PkgSchema>
	try {
		pkg = PkgSchema.parse(
			JSON.parse(
				fs.readFileSync(path.join(fullPath, 'package.json')).toString(),
			),
		)
	} catch (error) {
		throw new Error(`Could not parse package.json of ${fullPath}`, {
			cause: error,
		})
	}
	const propPath = prop.split('.')
	let value: any = pkg
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
