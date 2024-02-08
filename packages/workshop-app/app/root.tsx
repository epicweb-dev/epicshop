import { getPresentUsers } from '@kentcdodds/workshop-presence/presence.server'
import { getWorkshopTitle } from '@kentcdodds/workshop-utils/apps.server'
import {
	getDiscordMember,
	getPreferences,
	getUserInfo,
	readOnboardingData,
} from '@kentcdodds/workshop-utils/db.server'
import { makeTimings, time } from '@kentcdodds/workshop-utils/timing.server'
import { cssBundleHref } from '@remix-run/css-bundle'
import {
	type LoaderFunctionArgs,
	type HeadersFunction,
	type LinksFunction,
	type MetaFunction,
	json,
	redirect,
} from '@remix-run/node'
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { useSpinDelay } from 'spin-delay'
import { Confetti } from './components/confetti.tsx'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import { EpicProgress } from './components/progress-bar.tsx'
import { EpicToaster } from './components/toaster.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { useTheme } from './routes/theme/index.tsx'
import { getTheme } from './routes/theme/theme-session.server.ts'
import appStylesheetUrl from './styles/app.css'
import tailwindStylesheetUrl from './styles/tailwind.css'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { getConfetti } from './utils/confetti.server.ts'
import { getEnv } from './utils/env.server.ts'
import { getProgress } from './utils/epic-api.ts'
import { cn, combineHeaders, getDomainUrl, useAltDown } from './utils/misc.tsx'
import { Presence } from './utils/presence.tsx'
import { getToast } from './utils/toast.server.ts'

export const links: LinksFunction = () => {
	return [
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

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	return [{ title: data?.workshopTitle }]
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('rootLoader')
	const onboarding = await readOnboardingData()
	if (!ENV.KCDSHOP_DEPLOYED && !onboarding?.finishedTourVideo) {
		if (new URL(request.url).pathname !== '/onboarding') {
			throw redirect('/onboarding')
		}
	}
	const workshopTitle = await time(() => getWorkshopTitle(), {
		type: 'getWorkshopTitle',
		desc: 'getWorkshopTitle in root',
		timings,
	})

	const preferences = await getPreferences()
	const progress = await getProgress({ timings }).catch(e => {
		console.error('Failed to get progress', e)
		const emptyProgress: Awaited<ReturnType<typeof getProgress>> = []
		return emptyProgress
	})
	const { toast, headers: toastHeaders } = await getToast(request)
	const { confettiId, headers: confettiHeaders } = getConfetti(request)
	const discordMember = await getDiscordMember()
	const theme = getTheme(request)
	const user = await getUserInfo()
	const presentUsers = await getPresentUsers(user, { request, timings })
	return json(
		{
			workshopTitle,
			ENV: getEnv(),
			requestInfo: {
				domain: getDomainUrl(request),
				hints: getHints(request),
				path: new URL(request.url).pathname,
				session: { theme },
			},
			progress,
			preferences,
			discordMember,
			user,
			toast,
			confettiId,
			presence: {
				users: presentUsers,
			},
		},
		{
			headers: combineHeaders(toastHeaders, confettiHeaders, {
				'Server-Timing': timings.toString(),
			}),
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

function Document({
	children,
	env = {},
	className,
}: {
	children: React.ReactNode
	env?: Record<string, unknown>
	className: string
}) {
	return (
		<html lang="en" className={className}>
			<head>
				<ClientHintCheck />
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Links />
				<script
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
			</head>
			<body className="bg-background text-foreground scrollbar-thin scrollbar-thumb-scrollbar h-screen-safe">
				{children}
				<ScrollRestoration />
				<Scripts />
				{ENV.KCDSHOP_DEPLOYED ? null : <LiveReload />}
				{ENV.KCDSHOP_DEPLOYED ? null : (
					<script dangerouslySetInnerHTML={{ __html: getWebsocketJS() }} />
				)}
			</body>
		</html>
	)
}

function App() {
	const data = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const showSpinner = useSpinDelay(navigation.state !== 'idle', {
		delay: 400,
		minDuration: 200,
	})
	const altDown = useAltDown()

	const theme = useTheme()
	return (
		<Document
			className={cn(
				'antialiased h-screen-safe',
				theme,
				{ 'cursor-progress': showSpinner },
				altDown ? 'alt-down' : null,
			)}
			env={data.ENV}
		>
			<Outlet />
			<Confetti id={data.confettiId} />
			<EpicToaster toast={data.toast} />
			<EpicProgress />
		</Document>
	)
}

export default function AppWithProviders() {
	const { user } = useLoaderData<typeof loader>()
	return (
		<Presence user={user}>
			<TooltipProvider>
				<App />
			</TooltipProvider>
		</Presence>
	)
}

export function ErrorBoundary() {
	return (
		<Document className="h-screen-safe">
			<GeneralErrorBoundary />
		</Document>
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
