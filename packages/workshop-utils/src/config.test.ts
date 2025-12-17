import { test, expect } from 'vitest'
import { parseEpicshopConfig } from './config.server.ts'

test('parses epicshop config with modern product structure', () => {
	const packageJson = {
		name: 'test-workshop',
		epicshop: {
			title: 'Test Workshop',
			subtitle: 'A test subtitle',
			instructor: {
				name: 'Kent C. Dodds',
			},
			product: {
				host: 'www.epicweb.dev',
				displayName: 'EpicWeb.dev',
				slug: 'test-workshop',
			},
		},
	}

	const result = parseEpicshopConfig(packageJson)

	expect(result).toEqual({
		title: 'Test Workshop',
		subtitle: 'A test subtitle',
		instructor: { name: 'Kent C. Dodds' },
		product: {
			host: 'www.epicweb.dev',
			displayName: 'EpicWeb.dev',
			displayNameShort: 'EpicWeb.dev',
			slug: 'test-workshop',
		},
	})
})

test('returns null for package.json without epicshop field', () => {
	const packageJson = {
		name: 'regular-package',
		version: '1.0.0',
	}

	const result = parseEpicshopConfig(packageJson)

	expect(result).toBeNull()
})

test('returns null for null input', () => {
	const result = parseEpicshopConfig(null)

	expect(result).toBeNull()
})

test('returns null for non-object input', () => {
	const result = parseEpicshopConfig('not an object')

	expect(result).toBeNull()
})

test('handles minimal epicshop config', () => {
	const packageJson = {
		epicshop: {},
	}

	const result = parseEpicshopConfig(packageJson)

	expect(result).toEqual({
		title: undefined,
		subtitle: undefined,
		instructor: undefined,
		product: {
			host: undefined,
			displayName: undefined,
			displayNameShort: undefined,
			slug: undefined,
		},
	})
})

test('handles displayNameShort fallback to displayName', () => {
	const packageJson = {
		epicshop: {
			title: 'Test',
			product: {
				displayName: 'Epic Web',
			},
		},
	}

	const result = parseEpicshopConfig(packageJson)

	expect(result?.product.displayNameShort).toBe('Epic Web')
})
