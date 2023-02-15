import chai from 'chai'
import chaiDOM from 'chai-dom'
import { prettyDOM, configure } from '@testing-library/dom'

chai.use(chaiDOM)

// in the browser logging out the element is not necessary
configure({
	getElementError: message => new Error(message ?? 'Unknown error'),
})

export const { expect } = chai

export async function alfredTip<ReturnValue>(
	get: (() => ReturnValue) | (() => Promise<ReturnValue>),
	tip: string | ((error: unknown) => string),
	{ displayEl }: { displayEl?: true | ((error: unknown) => HTMLElement) } = {},
): Promise<ReturnValue> {
	let caughtError
	try {
		return await get()
	} catch (e: unknown) {
		caughtError = e
	}

	const tipString = typeof tip === 'function' ? tip(caughtError) : tip
	const error = caughtError instanceof Error ? caughtError : new Error()
	error.message = `🚨 ${tipString}${
		error.message ? `\n\n${error.message}` : ''
	}`
	if (displayEl) {
		const el =
			typeof displayEl === 'function' ? displayEl(caughtError) : document.body
		error.message += `\n\n${prettyDOM(el)}`
	}
	throw error
}
