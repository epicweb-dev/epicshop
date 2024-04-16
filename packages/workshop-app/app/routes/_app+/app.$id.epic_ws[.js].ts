import { invariantResponse } from '@epic-web/invariant'
import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { getBaseUrl } from '#app/utils/misc.tsx'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { id: appId } = params
	const url = new URL(request.url)
	const fileAppName = url.searchParams.get('fileAppName')
	invariantResponse(appId, 'App id is required')
	const app = await getAppByName(appId)
	const fileApp = fileAppName ? await getAppByName(fileAppName) : app
	if (!app || !fileApp) {
		throw new Response(
			`Apps with ids "${fileAppName}" (resolveDir) or "${appId}" (app) not found`,
			{ status: 404 },
		)
	}
	if (app.dev.type === 'script') {
		return redirect(getBaseUrl({ request, port: app.dev.portNumber }))
	}
	const relevantPaths = Array.from(new Set([app.fullPath, fileApp.fullPath]))

	const js = /* javascript */ `
	function epicLiveReloadConnect(config) {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:";
		const host = location.hostname;
		const port = location.port;
		const socketPath = protocol + "//" + host + ":" + port + "/__ws";
		const ws = new WebSocket(socketPath);
		ws.onmessage = (message) => {
			const event = JSON.parse(message.data);
			if (event.type !== 'epicshop:file-change') return;
			const { filePaths } = event.data;
			if (${JSON.stringify(relevantPaths)}.some(p => filePaths.some(filePath => filePath.startsWith(p)))) {
				console.log(
					['🐨 Reloading', window.frameElement?.getAttribute('title')]
						.filter(Boolean)
						.join(' '),
				);
				window.location.reload();
			}
		};
		ws.onopen = () => {
			if (config && typeof config.onOpen === "function") {
				config.onOpen();
			}
		};
		ws.onclose = (event) => {
			if (event.code === 1006) {
				console.log("Epic Web dev server web socket closed. Reconnecting...");
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
			console.log("Epic Web dev server web socket error:");
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
