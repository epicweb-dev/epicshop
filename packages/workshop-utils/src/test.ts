import { configure } from '@testing-library/dom'
import * as chai from 'chai'
import chaiDOM from 'chai-dom'

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

export async function testStep<ReturnValue>(
	title:
		| string
		| ((result: { type: 'fail'; error: Error } | { type: 'pass' }) => string),
	get: (() => ReturnValue) | (() => Promise<ReturnValue>),
): Promise<ReturnValue> {
	let caughtError
	try {
		const result = await get()
		const titleString =
			typeof title === 'function' ? title({ type: 'pass' }) : title
		if (window.parent === window) {
			console.log(`✅ ${titleString}`)
		} else {
			window.parent.postMessage(
				{
					type: 'epicshop:test-step-update',
					status: 'pass',
					title: titleString,
					timestamp: Date.now(),
				},
				'*',
			)
		}
		return result
	} catch (e: unknown) {
		caughtError = e
	}

	const error = isError(caughtError)
		? caughtError
		: new Error(typeof caughtError === 'string' ? caughtError : 'Unknown error')
	const titleString =
		typeof title === 'function' ? title({ type: 'fail', error }) : title
	error.message = `${titleString}${error.message ? `\n\n${error.message}` : ''}`
	throw error
}
