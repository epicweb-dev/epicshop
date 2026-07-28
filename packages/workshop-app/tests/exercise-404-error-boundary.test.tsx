import { renderToString } from 'react-dom/server'
import {
	MemoryRouter,
	UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
} from 'react-router'
import { expect, test, vi } from 'vitest'
import { Exercise404ErrorBoundary } from '../app/routes/_app+/exercise+/__shared/error-boundary.tsx'

function renderBoundary(
	error: ErrorResponseImpl,
	params: Record<string, string | undefined>,
) {
	return renderToString(
		<MemoryRouter>
			<Exercise404ErrorBoundary error={error} params={params} />
		</MemoryRouter>,
	)
}

test('renders a plain not-found for string 404 bodies without console.error (aha: EPICSHOP-H8)', () => {
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
	const error = new ErrorResponseImpl(404, '', 'Not found', false)
	const params = {
		exerciseNumber: 'wp-includes',
		stepNumber: 'l10n',
		type: 'min.php',
	}

	expect(() => renderBoundary(error, params)).not.toThrow()

	const html = renderBoundary(error, params)
	expect(html).toContain('wp-includes.l10n.min.php')
	expect(html).toContain('not found')
	expect(errorSpy).not.toHaveBeenCalled()
	errorSpy.mockRestore()
})

test('renders step-not-found guidance when the 404 payload matches the schema', () => {
	const error = new ErrorResponseImpl(
		404,
		'',
		{
			type: 'step-not-found',
			steps: [
				{
					stepNumber: 1,
					title: 'Hello',
					hasProblem: true,
					hasSolution: false,
				},
			],
			exerciseNumber: 1,
			exerciseTitle: 'Intro',
		},
		false,
	)

	const html = renderBoundary(error, {
		exerciseNumber: '01',
		stepNumber: '99',
		type: 'problem',
	})
	expect(html).toContain('Step not found')
	expect(html).toContain('Hello')
	expect(html).toContain('Available Steps')
})

test('logs only a string message when an object 404 payload fails the schema', () => {
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
	const error = new ErrorResponseImpl(
		404,
		'',
		{ type: 'unexpected', oops: true },
		false,
	)

	renderBoundary(error, {
		exerciseNumber: '01',
		stepNumber: '01',
		type: 'problem',
	})

	expect(errorSpy).toHaveBeenCalledOnce()
	const [message, details] = errorSpy.mock.calls[0] ?? []
	expect(message).toBe('Invalid 404 error response data')
	expect(typeof details).toBe('string')
	errorSpy.mockRestore()
})
