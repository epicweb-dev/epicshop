import * as dtl from '@testing-library/dom'
import * as matchers from '@testing-library/jest-dom/matchers'
import {
	JestAsymmetricMatchers,
	JestChaiExpect,
	JestExtend,
	type ExpectStatic,
} from '@vitest/expect'
import * as chai from 'chai'
import chaiDOM from 'chai-dom'

// allows using expect.extend instead of chai.use to extend plugins
chai.use(JestExtend)
// adds all jest matchers to expect
chai.use(JestChaiExpect)
// adds asymmetric matchers like stringContaining, objectContaining
chai.use(JestAsymmetricMatchers)

chai.use(chaiDOM)

// @ts-expect-error weird typescript nonsense
// I *think* vitest is using the extend API wrong or something 🤷‍♂️
// this works though so...
;(chai.expect as ExpectStatic).extend(chai.expect, matchers)
declare module '@vitest/expect' {
	interface JestAssertion<T = any> extends matchers.TestingLibraryMatchers<
		ReturnType<typeof expect.stringContaining>,
		T
	> {}
}

// in the browser logging out the element is not necessary
dtl.configure({
	getElementError: (message) => new Error(message ?? 'Unknown error'),
})

export const expect = chai.expect as ExpectStatic
export { dtl }

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
	} catch (caughtError: unknown) {
		const error = isError(caughtError)
			? caughtError
			: new Error(
					typeof caughtError === 'string' ? caughtError : 'Unknown error',
					{ cause: caughtError },
				)
		const titleString =
			typeof title === 'function' ? title({ type: 'fail', error }) : title
		if (window.parent === window) {
			console.error(`❌ ${titleString}`)
			console.error(error.message)
		}
		error.message = `${titleString}${error.message ? `\n\n${error.message}` : ''}`
		throw error
	}
}
