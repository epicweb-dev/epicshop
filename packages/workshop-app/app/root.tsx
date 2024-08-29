import path from 'node:path'
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'
import { getApps } from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getDiscordMember,
	getPreferences,
	getUserInfo,
	readOnboardingData,
} from '@epic-web/workshop-utils/db.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import { cssBundleHref } from '@remix-run/css-bundle'
import {
	json,
	redirect,
	type HeadersFunction,
	type LinksFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useNavigation,
	useRevalidator,
} from '@remix-run/react'
import { useEffect } from 'react'
import { useSpinDelay } from 'spin-delay'
import { Confetti } from './components/confetti.tsx'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import { EpicProgress } from './components/progress-bar.tsx'
import { EpicToaster } from './components/toaster.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { useTheme } from './routes/theme/index.tsx'
import { getTheme } from './routes/theme/theme-session.server.ts'
import appStylesheetUrl from './styles/app.css?url'
import tailwindStylesheetUrl from './styles/tailwind.css?url'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { getConfetti } from './utils/confetti.server.ts'
import { getProgress } from './utils/epic-api.ts'
import { cn, combineHeaders, getDomainUrl, useAltDown } from './utils/misc.tsx'
import { Presence } from './utils/presence.tsx'
import { getSeoMetaTags } from './utils/seo.ts'
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
	if (!data) return []

	return getSeoMetaTags({
		instructor: data.instructor,
		title: data.workshopTitle,
		description: data.workshopSubtitle,
		requestInfo: data.requestInfo,
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('rootLoader')
	const {
		title: workshopTitle,
		subtitle: workshopSubtitle,
		instructor,
		onboardingVideo,
	} = getWorkshopConfig()

	const onboarding = await readOnboardingData()
	if (
		!ENV.EPICSHOP_DEPLOYED &&
		!onboarding?.tourVideosWatched.includes(onboardingVideo)
	) {
		if (new URL(request.url).pathname !== '/onboarding') {
			throw redirect('/onboarding')
		}
	}

	const preferences = await getPreferences()
	const progress = await getProgress({ timings }).catch((e) => {
		console.error('Failed to get progress', e)
		const emptyProgress: Awaited<ReturnType<typeof getProgress>> = []
		return emptyProgress
	})
	const { toast, headers: toastHeaders } = await getToast(request)
	const { confettiId, headers: confettiHeaders } = getConfetti(request)
	const discordMember = await getDiscordMember()
	const theme = getTheme(request)
	const user = await getUserInfo()
	const apps = await getApps({ request, timings })
	const presentUsers = await getPresentUsers(user, { request, timings })
	return json(
		{
			workshopTitle,
			workshopSubtitle,
			instructor,
			apps: apps.map(({ name, fullPath, relativePath }) => ({
				name,
				fullPath,
				relativePath,
			})),
			ENV: getEnv(),
			requestInfo: {
				origin: new URL(request.url).origin,
				domain: getDomainUrl(request),
				hints: getHints(request),
				path: new URL(request.url).pathname,
				session: { theme },
				separator: path.sep,
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
	const revalidator = useRevalidator()
	useEffect(() => {
		window.__epicshop ??= {}
		window.__epicshop.handleFileChange = revalidator.revalidate
	}, [revalidator])
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
				{ENV.EPICSHOP_DEPLOYED ? null : (
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
	function epicLiveReloadConnect(config) {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:";
		const host = location.hostname;
		const port = location.port;
		const socketPath = protocol + "//" + host + ":" + port + "/__ws";
		const ws = new WebSocket(socketPath);
		function handleFileChange(changedFiles) {
			console.log(
				['🐨 Reloading', window.frameElement?.getAttribute('title')]
					.filter(Boolean)
					.join(' '),
				changedFiles
			);
			if (typeof window.__epicshop?.handleFileChange === "function") {
				window.__epicshop?.handleFileChange();
			} else {
				setTimeout(() => window.location.reload(), 200);
			}
		}
		function debounce(fn, ms) {
			let timeout;
			return function debouncedFn(...args) {
				clearTimeout(timeout);
				timeout = setTimeout(() => fn(...args), ms);
			};
		}
		const debouncedHandleFileChange = debounce(handleFileChange, 50);
		ws.onmessage = (message) => {
			const event = JSON.parse(message.data);
			if (event.type !== 'epicshop:file-change') return;
			const { filePaths } = event.data;
			debouncedHandleFileChange(filePaths);
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
	return js
}
