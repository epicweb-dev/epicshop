import chai from 'chai'
import chaiDOM from 'chai-dom'
import { prettyDOM, configure } from '@testing-library/dom'

chai.use(chaiDOM)

// in the browser logging out the element is not necessary
configure({
	getElementError: message => new Error(message ?? 'Unknown error'),
})

export const { expect } = chai

function isError(maybeError: any): maybeError is Error {
	return (
		maybeError &&
		typeof maybeError === 'object' &&
		'message' in maybeError &&
		typeof maybeError.message === 'string'
	)
}

export async function alfredTip<ReturnValue>(
	get: (() => ReturnValue) | (() => Promise<ReturnValue>),
	tip:
		| string
		| ((result: { type: 'fail'; error: Error } | { type: 'pass' }) => string),
	{ displayEl }: { displayEl?: true | ((error: unknown) => HTMLElement) } = {},
): Promise<ReturnValue> {
	let caughtError
	try {
		const result = await get()
		const tipString = typeof tip === 'function' ? tip({ type: 'pass' }) : tip
		if (window.parent !== window) {
			window.parent.postMessage(
				{
					type: 'kcdshop:test-alfred-update',
					status: 'pass',
					tip: tipString,
					timestamp: Date.now(),
				},
				'*',
			)
		} else {
			console.log(`✅ ${tipString}`)
		}
		return result
	} catch (e: unknown) {
		caughtError = e
	}

	const error = isError(caughtError)
		? caughtError
		: new Error(typeof caughtError === 'string' ? caughtError : 'Unknown error')
	const tipString =
		typeof tip === 'function' ? tip({ type: 'fail', error }) : tip
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
