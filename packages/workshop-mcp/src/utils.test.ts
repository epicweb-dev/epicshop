import { test, expect } from 'vitest'
import { workshopDirectoryInputSchema } from './utils.ts'

test('workshopDirectoryInputSchema should validate valid string', () => {
	const validInput = '/path/to/workshop'
	const result = workshopDirectoryInputSchema.safeParse(validInput)

	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toBe(validInput)
	}
})

test('workshopDirectoryInputSchema should reject non-string input', () => {
	const invalidInputs = [123, true, null, undefined, {}]

	invalidInputs.forEach((input) => {
		const result = workshopDirectoryInputSchema.safeParse(input)
		expect(result.success).toBe(false)
	})
})

test('workshopDirectoryInputSchema should accept empty string', () => {
	const emptyString = ''
	const result = workshopDirectoryInputSchema.safeParse(emptyString)

	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toBe(emptyString)
	}
})

test('workshopDirectoryInputSchema should accept string with spaces', () => {
	const inputWithSpaces = '  /path/with/spaces  '
	const result = workshopDirectoryInputSchema.safeParse(inputWithSpaces)

	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toBe(inputWithSpaces)
	}
})

test('workshopDirectoryInputSchema should accept absolute paths', () => {
	const absolutePaths = [
		'/Users/username/projects/workshop',
		'C:\\Users\\username\\projects\\workshop',
		'/home/user/workshop',
	]

	absolutePaths.forEach((path) => {
		const result = workshopDirectoryInputSchema.safeParse(path)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toBe(path)
		}
	})
})

test('workshopDirectoryInputSchema should accept relative paths', () => {
	const relativePaths = [
		'./workshop',
		'../workshop',
		'../../workshop',
		'workshop',
	]

	relativePaths.forEach((path) => {
		const result = workshopDirectoryInputSchema.safeParse(path)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toBe(path)
		}
	})
})
