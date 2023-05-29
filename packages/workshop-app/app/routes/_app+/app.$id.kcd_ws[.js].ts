import type { DataFunctionArgs } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { getAppByName } from '~/utils/apps.server.ts'
import { redirect } from 'react-router'

export async function loader({ params, request }: DataFunctionArgs) {
	const { id: appId } = params
	const url = new URL(request.url)
	const fileAppName = url.searchParams.get('fileAppName')
	invariant(appId, 'App id is required')
	const app = await getAppByName(appId)
	const fileApp = fileAppName ? await getAppByName(fileAppName) : app
	if (!app || !fileApp) {
		throw new Response(
			`Apps with ids "${fileAppName}" (resolveDir) or "${appId}" (app) not found`,
			{ status: 404 },
		)
	}
	if (app.dev.type === 'script') {
		return redirect(app.dev.baseUrl)
	}
	const relevantPaths = Array.from(new Set([app.fullPath, fileApp.fullPath]))

	const js = /* javascript */ `
	function kcdLiveReloadConnect(config) {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:";
		const host = location.hostname;
		const port = location.port;
		const socketPath = protocol + "//" + host + ":" + port + "/__ws";
		const ws = new WebSocket(socketPath);
		ws.onmessage = (message) => {
			const event = JSON.parse(message.data);
			if (event.type !== 'kcdshop:file-change') return;
			const { filePath } = event.data;
			if (${JSON.stringify(relevantPaths)}.some(p => filePath.startsWith(p))) {
				console.log(
					[
						'🐨 Reloading',
						window.frameElement?.getAttribute('title'),
						' window ...',
					]
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
				console.log("KCD dev server web socket closed. Reconnecting...");
				setTimeout(
					() =>
						kcdLiveReloadConnect({
							onOpen: () => window.location.reload(),
						}),
				1000
				);
			}
		};
		ws.onerror = (error) => {
			console.log("KCD dev server web socket error:");
			console.error(error);
		};
	}
	kcdLiveReloadConnect();
	`
	return new Response(js, {
		headers: {
			'Content-Length': Buffer.byteLength(js).toString(),
			'Content-Type': 'text/javascript',
		},
	})
}
