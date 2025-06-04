import path from 'node:path'
import { getPresentUsers } from '@epic-web/workshop-presence/presence.server'
import { getApps } from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getPreferences,
	readOnboardingData,
	getMutedNotifications,
} from '@epic-web/workshop-utils/db.server'
import { getEnv } from '@epic-web/workshop-utils/env.server'
import {
	getProgress,
	getUserInfo,
	userHasAccessToWorkshop,
} from '@epic-web/workshop-utils/epic-api.server'
import { checkForUpdatesCached } from '@epic-web/workshop-utils/git.server'
import { getUnmutedNotifications } from '@epic-web/workshop-utils/notifications.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import {
	getSetClientIdCookieHeader,
	getUserId,
} from '@epic-web/workshop-utils/user.server'
import { checkConnectionCached } from '@epic-web/workshop-utils/utils.server'
import { cssBundleHref } from '@remix-run/css-bundle'
import {
	unstable_data as data,
	redirect,
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
} from '@remix-run/react'
import { promiseHash } from 'remix-utils/promise'
import { useSpinDelay } from 'spin-delay'
import { Confetti } from './components/confetti.tsx'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import { EpicProgress } from './components/progress-bar.tsx'
import { EpicToaster } from './components/toaster.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { Notifications } from './routes/admin+/notifications.tsx'
import { UpdateToast } from './routes/admin+/update-repo.tsx'
import { useTheme } from './routes/theme/index.tsx'
import { getTheme } from './routes/theme/theme-session.server.ts'
import appStylesheetUrl from './styles/app.css?url'
import tailwindStylesheetUrl from './styles/tailwind.css?url'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { getConfetti } from './utils/confetti.server.ts'
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
		{
			rel: 'icon',
			href: '/favicon.ico',
			sizes: '48x48',
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
	const workshopConfig = getWorkshopConfig()
	const {
		title: workshopTitle,
		subtitle: workshopSubtitle,
		instructor,
		onboardingVideo,
	} = workshopConfig

	const onboarding = await readOnboardingData()
	if (
		!ENV.EPICSHOP_DEPLOYED &&
		!onboarding?.tourVideosWatched.includes(onboardingVideo)
	) {
		if (new URL(request.url).pathname !== '/onboarding') {
			throw redirect('/onboarding')
		}
	}
	const theme = getTheme(request)
	const { confettiId, headers: confettiHeaders } = getConfetti(request)
	const { toast, headers: toastHeaders } = await getToast(request)
	const isOnlinePromise = checkConnectionCached({ request, timings })

	const asyncStuff = await promiseHash({
		userId: getUserId({ request }),
		preferences: getPreferences(),
		progress: getProgress({ timings }).catch((e) => {
			console.error('Failed to get progress', e)
			const emptyProgress: Awaited<ReturnType<typeof getProgress>> = []
			return emptyProgress
		}),
		user: getUserInfo(),
		userHasAccess: userHasAccessToWorkshop({ request, timings }),
		apps: getApps({ request, timings }),
		repoUpdates: checkForUpdatesCached(),
		unmutedNotifications: getUnmutedNotifications(),
	})

	const presentUsers = await getPresentUsers({
		request,
		timings,
	})

	// Filter out repoUpdates if muted
	const mutedNotifications = await getMutedNotifications()
	let repoUpdates = asyncStuff.repoUpdates
	if (
		repoUpdates &&
		repoUpdates.remoteCommit &&
		mutedNotifications.includes(repoUpdates.remoteCommit)
	) {
		repoUpdates = { ...repoUpdates, updatesAvailable: false }
	}

	return data(
		{
			...asyncStuff,
			workshopConfig,
			workshopTitle,
			workshopSubtitle,
			instructor,
			apps: asyncStuff.apps.map(({ name, fullPath, relativePath }) => ({
				name,
				fullPath,
				relativePath,
			})),
			ENV: getEnv(),
			requestInfo: {
				protocol: new URL(request.url).protocol,
				hostname: new URL(request.url).hostname,
				port: new URL(request.url).port,
				origin: new URL(request.url).origin,
				domain: getDomainUrl(request),
				hints: getHints(request),
				path: new URL(request.url).pathname,
				session: { theme },
				separator: path.sep,
				online: await isOnlinePromise,
			},
			toast,
			confettiId,
			presence: {
				users: presentUsers,
			},
			repoUpdates,
		},
		{
			headers: combineHeaders(
				toastHeaders,
				confettiHeaders,
				{ 'Server-Timing': timings.toString() },
				asyncStuff.userId?.type === 'cookie.randomId'
					? { 'Set-Cookie': getSetClientIdCookieHeader(asyncStuff.userId.id) }
					: undefined,
			),
		},
	)
}

function Document({
	children,
	env = {},
	className,
	style,
}: {
	children: React.ReactNode
	env?: Record<string, unknown>
	className: string
	style?: React.CSSProperties
}) {
	return (
		<html lang="en" className={className} style={style}>
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
			style={
				data.preferences?.fontSize
					? { fontSize: `${data.preferences?.fontSize}px` }
					: {}
			}
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
			<UpdateToast repoUpdates={data.repoUpdates} />
			<EpicProgress />
			<Notifications unmutedNotifications={data.unmutedNotifications} />
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
