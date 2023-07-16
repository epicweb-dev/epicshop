import { cssBundleHref } from '@remix-run/css-bundle'
import type {
	DataFunctionArgs,
	HeadersFunction,
	LinksFunction,
	SerializeFrom,
	V2_MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useBeforeUnload,
	useLoaderData,
	useLocation,
	useNavigation,
} from '@remix-run/react'
import { useCallback, useEffect } from 'react'
import { useSpinDelay } from 'spin-delay'
import { useTheme } from './routes/theme/index.tsx'
import { getTheme } from './routes/theme/theme-session.server.ts'
import appStylesheetUrl from './styles/app.css'
import tailwindStylesheetUrl from './styles/tailwind.css'
import { getWorkshopTitle } from './utils/apps.server.ts'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { cn } from './utils/misc.tsx'
import {
	getServerTimeHeader,
	makeTimings,
	time,
} from './utils/timing.server.ts'
import { getEnv } from './utils/env.server.ts'

export const links: LinksFunction = () => {
	return [
		{ rel: 'preload', href: '/icons.svg', as: 'image/svg+xml' },
		{ rel: 'stylesheet', href: '/neogrotesk-font.css' },
		{
			rel: 'stylesheet',
			href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,200;0,300;0,400;0,500;0,600;1,700&display=swap',
		},
		{ rel: 'stylesheet', href: tailwindStylesheetUrl },
		{ rel: 'stylesheet', href: appStylesheetUrl },
		...(cssBundleHref ? [{ rel: 'stylesheet', href: cssBundleHref }] : []),
		{ rel: 'mask-icon', href: '/favicons/favicon.svg' },
		{
			rel: 'alternate icon',
			type: 'image/png',
			href: '/favicon.png',
		},
		{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
	]
}

export const meta: V2_MetaFunction = ({
	data,
}: {
	data: SerializeFrom<typeof loader>
}) => {
	return [{ title: data?.workshopTitle }]
}

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('rootLoader')
	const workshopTitle = await time(() => getWorkshopTitle(), {
		type: 'getWorkshopTitle',
		desc: 'getWorkshopTitle in root',
		timings,
	})
	const theme = await getTheme(request)
	return json(
		{
			workshopTitle,
			ENV: getEnv(),
			requestInfo: {
				hints: getHints(request),
				path: new URL(request.url).pathname,
				session: { theme },
			},
		},
		{
			headers: {
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
	const data = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const showSpinner = useSpinDelay(navigation.state !== 'idle', {
		delay: 400,
		minDuration: 200,
	})
	const theme = useTheme()
	return (
		<html
			lang="en"
			className={cn('h-full', theme, { 'cursor-progress': showSpinner })}
		>
			<head>
				<ClientHintCheck />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Meta />
				<Links />
				<script
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(data.ENV)}`,
					}}
				/>
			</head>
			<body className="scrollbar-thin scrollbar-thumb-scrollbar bg-background text-foreground h-full">
				<Outlet />
				<ScrollRestoration />
				<ElementScrollRestoration elementQuery="[data-restore-scroll='true']" />
				<Scripts />
				<LiveReload />
				<script dangerouslySetInnerHTML={{ __html: getWebsocketJS() }} />
			</body>
		</html>
	)
}

function ElementScrollRestoration({
	elementQuery,
	...props
}: { elementQuery: string } & React.HTMLProps<HTMLScriptElement>) {
	const STORAGE_KEY = `position:${elementQuery}`
	const navigation = useNavigation()
	const location = useLocation()

	const updatePositions = useCallback(() => {
		const element = document.querySelector(elementQuery)
		if (!element) return
		let positions = {}
		try {
			const rawPositions = JSON.parse(
				sessionStorage.getItem(STORAGE_KEY) || '{}',
			)
			if (typeof rawPositions === 'object' && rawPositions !== null) {
				positions = rawPositions
			}
		} catch (error) {
			console.warn(`Error parsing scroll positions from sessionStorage:`, error)
		}
		const newPositions = {
			...positions,
			[location.key]: element.scrollTop,
		}
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newPositions))
	}, [STORAGE_KEY, elementQuery, location.key])

	useEffect(() => {
		if (navigation.state === 'idle') {
			const element = document.querySelector(elementQuery)
			if (!element) return
			try {
				const positions = JSON.parse(
					sessionStorage.getItem(STORAGE_KEY) || '{}',
				) as any
				const storedY = positions[window.history.state.key]
				if (typeof storedY === 'number') {
					element.scrollTop = storedY
				}
			} catch (error: unknown) {
				console.error(error)
				sessionStorage.removeItem(STORAGE_KEY)
			}
		} else {
			updatePositions()
		}
	}, [STORAGE_KEY, elementQuery, navigation.state, updatePositions])

	useBeforeUnload(() => {
		updatePositions()
	})

	function restoreScroll(storageKey: string, elementQuery: string) {
		const element = document.querySelector(elementQuery)
		if (!element) {
			console.warn(`Element not found: ${elementQuery}. Cannot restore scroll.`)
			return
		}
		if (!window.history.state || !window.history.state.key) {
			const key = Math.random().toString(32).slice(2)
			window.history.replaceState({ key }, '')
		}
		try {
			const positions = JSON.parse(
				sessionStorage.getItem(storageKey) || '{}',
			) as any
			const storedY = positions[window.history.state.key]
			if (typeof storedY === 'number') {
				element.scrollTop = storedY
			}
		} catch (error: unknown) {
			console.error(error)
			sessionStorage.removeItem(storageKey)
		}
	}
	return (
		<script
			{...props}
			suppressHydrationWarning
			dangerouslySetInnerHTML={{
				__html: `(${restoreScroll})(${JSON.stringify(
					STORAGE_KEY,
				)}, ${JSON.stringify(elementQuery)})`,
			}}
		/>
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
			const { filePath, embeddedFile } = event.data;
			if ((embeddedFile || filePath.includes('README')) && !filePath.includes('playground')) {
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
				setTimeout(() => window.location.reload(), 200)
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
