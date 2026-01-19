import {
	createTemporaryReferenceSet,
	decodeAction,
	decodeFormState,
	decodeReply,
	loadServerAction,
	renderToReadableStream,
} from '@vitejs/plugin-rsc/rsc'
import {
	RouterContextProvider,
	unstable_matchRSCServerRequest as matchRSCServerRequest,
} from 'react-router'

import routes from 'virtual:react-router/unstable_rsc/routes'
import basename from 'virtual:react-router/unstable_rsc/basename'
import unstable_reactRouterServeConfig from 'virtual:react-router/unstable_rsc/react-router-serve-config'

export { unstable_reactRouterServeConfig }

export function fetchServer(
	request: Request,
	requestContext?: RouterContextProvider,
) {
	return matchRSCServerRequest({
		basename,
		createTemporaryReferenceSet,
		decodeAction,
		decodeFormState,
		decodeReply,
		loadServerAction,
		request,
		requestContext,
		routes,
		generateResponse(match, options) {
			return new Response(renderToReadableStream(match.payload, options), {
				status: match.statusCode,
				headers: match.headers,
			})
		},
	})
}

export default {
	async fetch(request: Request, requestContext?: RouterContextProvider) {
		if (requestContext && !(requestContext instanceof RouterContextProvider)) {
			requestContext = undefined
		}

		const ssr = await import.meta.viteRsc.loadModule<
			typeof import('./entry.ssr.tsx')
		>('ssr', 'index')

		return await ssr.generateHTML(
			request,
			await fetchServer(request, requestContext),
		)
	},
}

if (import.meta.hot) {
	import.meta.hot.accept()
}
