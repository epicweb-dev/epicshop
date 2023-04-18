import type {
	HeadersFunction,
	LinksFunction,
	SerializeFrom,
	V2_MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import { useSpinDelay } from 'spin-delay'
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useNavigation,
} from '@remix-run/react'
import appStylesheetUrl from './styles/app.css'
import tailwindStylesheetUrl from './styles/tailwind.css'
import { getWorkshopTitle } from './utils/apps.server'
import clsx from 'clsx'
import { getServerTimeHeader, makeTimings, time } from './utils/timing.server'

export const links: LinksFunction = () => {
	return [
		{ rel: 'stylesheet', href: '/neogrotesk-font.css' },
		{
			rel: 'stylesheet',
			href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,200;0,300;0,400;0,500;0,600;1,700&display=swap',
		},
		{ rel: 'stylesheet', href: tailwindStylesheetUrl },
		{ rel: 'stylesheet', href: appStylesheetUrl },
	]
}

export const meta: V2_MetaFunction = ({
	data,
}: {
	data: SerializeFrom<typeof loader>
}) => {
	return [{ title: data?.workshopTitle }]
}

export async function loader() {
	const timings = makeTimings('rootLoader')
	const workshopTitle = await time(() => getWorkshopTitle(), {
		type: 'getWorkshopTitle',
		desc: 'getWorkshopTitle in root',
		timings,
	})
	return json(
		{ workshopTitle: workshopTitle },
		{
			headers: {
				'Cache-Control': 'public, max-age=300',
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		'Server-Timing': loaderHeaders.get('Server-Timing') ?? '',
	}
	return headers
}

export default function App() {
	const navigation = useNavigation()
	const showSpinner = useSpinDelay(navigation.state !== 'idle', {
		delay: 400,
		minDuration: 200,
	})
	return (
		<html
			lang="en"
			className={clsx('h-full', { 'cursor-progress': showSpinner })}
			data-theme="light"
		>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Meta />
				<meta name="charset" content="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Links />
			</head>
			<body className="scrollbar-thin scrollbar-thumb-gray-300 h-full">
				<Outlet />
				<ScrollRestoration />
				<Scripts />
				<LiveReload />
				<script dangerouslySetInnerHTML={{ __html: getWebsocketJS() }} />
			</body>
		</html>
	)
}

function getWebsocketJS() {
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
			if (filePath.includes('README') && !filePath.includes('playground')) {
				console.log(
					[
						'🐨 Reloading',
						window.frameElement?.getAttribute('title'),
						' window ...',
						filePath + " changed",
					]
						.filter(Boolean)
						.join(' '),
				);
				setTimeout(() => {
					window.location.reload();
				}, 200)
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
	return js
}
