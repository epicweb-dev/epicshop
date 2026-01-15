// A function that doubles each number in an array
export function doubleNumbers(numbers: number[]): number[] {
	return numbers.map((n) => n * 2)
}

// Test array
const input = [1, 2, 3, 4, 5]

// Log the input
console.log('Input:', input)

// Call the function and export the result
export const result = doubleNumbers(input)

// Log the result
console.log('Result:', result)

// Export some additional values to demonstrate the export display
export const greeting = 'Hello from export app!'
export const config = {
	name: 'Export App Demo',
	version: 1,
	enabled: true,
}
