import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr'
import { type ReactFormState } from 'react-dom/client'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
	unstable_routeRSCServerRequest as routeRSCServerRequest,
	unstable_RSCStaticRouter as RSCStaticRouter,
} from 'react-router'

export async function generateHTML(
	request: Request,
	fetchServer: (request: Request) => Promise<Response>,
): Promise<Response> {
	return await routeRSCServerRequest({
		request,
		fetchServer,
		createFromReadableStream,
		async renderHTML(getPayload) {
			const payload = await getPayload()
			const formState =
				payload.type === 'render'
					? ((await payload.formState) as ReactFormState | null)
					: undefined

			const bootstrapScriptContent =
				await import.meta.viteRsc.loadBootstrapScriptContent('index')

			return await renderToReadableStream(
				<RSCStaticRouter getPayload={getPayload} />,
				{
					bootstrapScriptContent,
					formState,
					signal: request.signal,
				},
			)
		},
	})
}
