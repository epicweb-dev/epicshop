// This is a progressive enhancement utility to ensure that the user is redirected
// to the page they are on if the JavaScript hasn't had a chance to hydrate yet.
// I think when Remix has middleware, this will be easier to do automatically.

import { data, redirect, useLocation } from 'react-router'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { ServerOnly } from 'remix-utils/server-only'

const PE_REDIRECT_INPUT_NAME = '__PE_redirectTo'

export function usePERedirectInput() {
	const location = useLocation()
	return (
		<ServerOnly>
			{() => (
				<input
					type="hidden"
					name={PE_REDIRECT_INPUT_NAME}
					value={location.pathname}
				/>
			)}
		</ServerOnly>
	)
}

export function ensureProgressiveEnhancement(
	request: Request,
	formData: FormData,
	responseInit?: () => Parameters<typeof redirect>[1],
) {
	const redirectTo = formData.get(PE_REDIRECT_INPUT_NAME)
	if (typeof redirectTo === 'string') {
		throw redirect(safeRedirect(redirectTo), responseInit?.())
	}

	// if request does not accept application/json, it means JS hasn't hydrated yet
	if (!acceptsJson(request)) {
		const redirectToReferrer = request.headers.get('Referer') ?? '/'
		throw redirect(safeRedirect(redirectToReferrer), responseInit?.())
	}
}

function acceptsJson(request: Request) {
	const accept = request.headers.get('Accept') ?? ''
	return (
		accept.includes('application/json') ||
		accept.includes('*/*') ||
		accept.includes('application/*') ||
		accept.includes('*/json')
	)
}

export function dataWithPE<Data>(
	request: Request,
	formData: FormData,
	...args: Parameters<typeof data<Data>>
) {
	ensureProgressiveEnhancement(request, formData, () => ({
		statusText: JSON.stringify(args[0]),
		...(typeof args[1] === 'number' ? { status: args[1] } : args[1]),
	}))
	return data(...args)
}
