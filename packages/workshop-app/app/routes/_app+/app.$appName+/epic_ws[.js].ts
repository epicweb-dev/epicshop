import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { getBaseUrl } from '#app/utils/misc.tsx'
import { resolveApps } from './__utils.ts'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const timings = makeTimings('epic_ws script')
	const { fileApp, app } = await resolveApps({ request, params, timings })
	if (!fileApp || !app) {
		throw new Response(`Apps not found`, { status: 404 })
	}
	if (app.dev.type === 'script') {
		return redirect(getBaseUrl({ request, port: app.dev.portNumber }))
	}
	const relevantPaths = Array.from(new Set([app.fullPath, fileApp.fullPath]))
	const watchParams = new URLSearchParams()
	for (const path of relevantPaths) {
		watchParams.append('watch', path)
	}

	const js = /* javascript */ `
	function epicLiveReloadConnect(config) {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:";
		const host = location.hostname;
		const port = location.port;
		const socketPath = protocol + "//" + host + ":" + port + "/__ws?" + ${JSON.stringify(watchParams.toString())};
		const ws = new WebSocket(socketPath);
		ws.onmessage = (message) => {
			const event = JSON.parse(message.data);
			if (event.type !== 'epicshop:file-change') return;
			const { filePaths } = event.data;
			console.log(
				['🐨 Reloading', window.frameElement?.getAttribute('title'), 'due to file changes:']
					.filter(Boolean)
					.join(' '),
				filePaths
			);
			window.location.reload();
		};
		ws.onopen = () => {
			if (config && typeof config.onOpen === "function") {
				config.onOpen();
			}
		};
		ws.onclose = (event) => {
			if (event.code === 1006) {
				console.log("EpicShop dev server web socket closed. Reconnecting...");
				setTimeout(
					() =>
						epicLiveReloadConnect({
							onOpen: () => window.location.reload(),
						}),
				1000
				);
			}
		};
		ws.onerror = (error) => {
			console.log("EpicShop dev server web socket error:");
			console.error(error);
		};
	}
	epicLiveReloadConnect();
	`
	return new Response(js, {
		headers: {
			'Content-Length': Buffer.byteLength(js).toString(),
			'Content-Type': 'text/javascript',
		},
	})
}
