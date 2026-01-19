import {
	extractNumbersAndTypeFromAppNameOrPath,
	getApps,
	getExercises,
	getPlaygroundAppName,
	isExtraApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { clsx } from 'clsx'
import { motion, useAnimationControls } from 'framer-motion'
import * as React from 'react'
import {
	Link,
	NavLink,
	Outlet,
	useLoaderData,
	useLocation,
	useParams,
	data,
	type HeadersFunction,
	type LoaderFunctionArgs,
} from 'react-router'
import { useHydrated } from 'remix-utils/use-hydrated'
import { Icon } from '#app/components/icons.tsx'
import { makeMediaQueryStore } from '#app/components/media-query.ts'
import {
	OnboardingBadge,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'
import { Logo } from '#app/components/product.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTrigger,
} from '#app/components/ui/dialog.tsx'
import {
	SimpleTooltip,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { useOptionalUser, useUserHasAccess } from '#app/components/user.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { cn, getExercisePath, getExerciseStepPath } from '#app/utils/misc.tsx'
import { useIsOnline } from '#app/utils/online.ts'
import {
	getProductHostEmoji,
	productHostEmojis,
	usePresence,
	type Location,
	type User,
} from '#app/utils/presence.tsx'
import { useApps } from '#app/utils/root-loader.ts'
import {
	useExerciseProgressClassName,
	useNextExerciseRoute,
	useProgressItemClassName,
	type ProgressItemSearch,
} from '../progress.tsx'
import { ThemeSwitch } from '../theme/index.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('appLayoutLoader')
	const { title: workshopTitle } = getWorkshopConfig()
	const [exercises, playgroundAppName, apps] = await Promise.all([
		getExercises({ request, timings }),
		getPlaygroundAppName(),
		getApps({ request, timings }),
	])

	const playgroundNumbersAndType = extractNumbersAndTypeFromAppNameOrPath(
		playgroundAppName ?? '',
	)
	const playground = {
		appName: playgroundAppName,
		exerciseNumber: Number(playgroundNumbersAndType?.exerciseNumber),
		stepNumber: Number(playgroundNumbersAndType?.stepNumber),
		type: playgroundNumbersAndType?.type,
	}

	const result = data(
		{
			workshopTitle,
			exercises: exercises.map((e) => ({
				exerciseNumber: e.exerciseNumber,
				title: e.title,
				solutions: e.solutions.map(({ stepNumber, title, name }) => ({
					stepNumber,
					title,
					name,
				})),
				problems: e.problems.map(({ stepNumber, title, name }) => ({
					stepNumber,
					title,
					name,
				})),
				steps: e.steps.map(({ stepNumber, problem, solution }) => ({
					stepNumber,
					title: problem?.title ?? solution?.title ?? 'Unknown',
					name: problem?.name ?? solution?.name ?? 'Unknown',
					problem: problem
						? { name: problem.name, title: problem.title }
						: null,
					solution: solution
						? { name: solution.name, title: solution.title }
						: null,
				})),
			})),
			extras: apps
				.filter(isExtraApp)
				.sort((a, b) =>
					a.title.localeCompare(b.title, undefined, {
						numeric: true,
						sensitivity: 'base',
					}),
				)
				.map((extra) => ({
					dirName: extra.dirName,
					title: extra.title,
					name: extra.name,
				})),
			playground,
			isMenuOpened:
				request.headers.get('cookie')?.includes('es_menu_open=true') ?? false,
		},
		{
			headers: {
				Vary: 'Cookie',
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
	return result
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		Vary: 'Cookie',
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

const opacities = ['opacity-70', 'opacity-80', 'opacity-90', 'opacity-100']
const shadows = [
	'shadow-[0_0_2px_0_rgba(0,0,0,0.3)]',
	'shadow-[0_0_4px_0_rgba(0,0,0,0.3)]',
	'shadow-[0_0_7px_0_rgba(0,0,0,0.3)]',
	'shadow-[0_0_10px_0_rgba(0,0,0,0.3)]',
]
function getScoreClassNames(score: number) {
	const opacityNumber = Math.round(score * opacities.length - 1)
	const shadowNumber = Math.round(score * shadows.length - 1)
	return cn(
		'shadow-highlight hover:opacity-100 focus:opacity-100',
		opacities[opacityNumber] ?? 'opacity-60',
		shadows[shadowNumber] ?? 'shadow-none',
		score === 1 ? 'animate-pulse hover:animate-none focus:animate-none' : null,
	)
}

function FacePile({ isMenuOpened }: { isMenuOpened: boolean }) {
	const loggedInUser = useOptionalUser()
	const { users } = usePresence()
	const {
		product: { displayNameShort },
	} = useWorkshopConfig()
	const limit = isMenuOpened ? 17 : 0
	const numberOverLimit = users.length - limit
	const shouldShowNumberOverLimit = numberOverLimit > (isMenuOpened ? 1 : 0)

	if (!users.length) return null

	const tiffany =
		isMenuOpened && users.length === 1 ? (
			<Link
				target="_blank"
				rel="noopener noreferrer"
				to="https://www.youtube.com/watch?v=w6Q3mHyzn78"
			>
				<img
					alt="Tiffany Tunes"
					className={cn(
						'h-8 w-8 rounded-full border object-cover',
						getScoreClassNames(1),
					)}
					src="/img/tiffany.png"
				/>
			</Link>
		) : null
	const overLimitLabel = `${numberOverLimit}${
		isMenuOpened ? ' more ' : ' '
	}${displayNameShort} Dev${numberOverLimit === 1 ? '' : 's'} working now`
	return (
		<div className="flex flex-wrap items-center gap-2">
			<TooltipProvider>
				{(shouldShowNumberOverLimit ? users.slice(0, limit) : users).map(
					({ user, score }) => {
						const scoreClassNames = getScoreClassNames(score)
						const locations = getUserLocations(user)
						const imageUrl = user.imageUrlSmall || user.avatarUrl
						const hasAccess = user.hasAccess
						const local = locations.some((loc) =>
							loc.origin?.includes('localhost'),
						)
						const productHostEmojis = getUniqueProductHostEmojis(locations)
						const loggedInEmojis = getLoggedInProductEmojis(
							user.loggedInProductHosts,
						)

						// Handle opted-out users
						if (user.optOut) {
							return (
								<Tooltip key={user.id}>
									<TooltipTrigger asChild tabIndex={0}>
										<div
											className="relative"
											aria-label="Anonymous user (opted out)"
										>
											<div
												className={cn(
													'bg-muted flex h-8 w-8 items-center justify-center rounded-full border opacity-50',
												)}
											>
												<Icon name="User" />
											</div>
										</div>
									</TooltipTrigger>
									<TooltipContent>
										<span className="flex flex-col items-center justify-center gap-1">
											<span className="flex items-center gap-1.5">
												{loggedInEmojis ? (
													<span className="text-xs">{loggedInEmojis}</span>
												) : null}
												Anonymous (opted out of sharing)
											</span>
										</span>
									</TooltipContent>
								</Tooltip>
							)
						}

						let doingLabel: string
						if (hasAccess) {
							doingLabel = local ? 'working' : 'referencing'
						} else {
							doingLabel = local ? 'previewing' : 'reviewing'
						}

						return (
							<Tooltip key={user.id}>
								<TooltipTrigger asChild tabIndex={0}>
									<div
										className="relative"
										aria-label={user.name || `${displayNameShort} Dev`}
									>
										{imageUrl ? (
											<img
												alt={user.name || displayNameShort}
												className={cn(
													'h-8 w-8 rounded-full border object-cover',
													scoreClassNames,
												)}
												src={imageUrl}
											/>
										) : (
											<div
												className={cn(
													'flex h-8 w-8 items-center justify-center rounded-full border',
													scoreClassNames,
												)}
											>
												<Icon name="User" />
											</div>
										)}
										{productHostEmojis ? (
											<span
												className="absolute -top-1 -left-1 text-xs leading-none"
												aria-label="Workshop products"
											>
												{productHostEmojis}
											</span>
										) : null}
									</div>
								</TooltipTrigger>
								<TooltipContent>
									<span className="flex flex-col items-center justify-center gap-1">
										<span className="flex items-center gap-1.5">
											{loggedInEmojis ? (
												<span className="text-xs">{loggedInEmojis}</span>
											) : null}
											{user.name || `${displayNameShort} Dev`}
											{locations.length > 0
												? ` is ${doingLabel} ${
														score === 1 && loggedInUser?.id !== user.id
															? 'with you'
															: ''
													} on`
												: null}
										</span>
										{locations.map((loc, index) => {
											const locationLabel = getLocationLabel(loc)
											if (!locationLabel) return null
											return (
												<span
													key={`${loc.workshopTitle}-${index}`}
													className={cn(
														'flex flex-col items-center',
														locations.length > 1
															? 'border-border mt-1 border-t pt-1 first:mt-0 first:border-t-0 first:pt-0'
															: '',
													)}
												>
													{locationLabel.line1 ? (
														<span>
															{getProductHostEmoji(loc.productHost)}{' '}
															{locationLabel.line1}
														</span>
													) : null}
													{locationLabel.line2 ? (
														<span className="text-muted-foreground text-xs">
															{locationLabel.line2}
														</span>
													) : null}
												</span>
											)
										})}
									</span>
								</TooltipContent>
							</Tooltip>
						)
					},
				)}
				{tiffany}
				{shouldShowNumberOverLimit ? (
					<Tooltip>
						<TooltipTrigger asChild tabIndex={0}>
							<div
								aria-label={overLimitLabel}
								className={cn(
									'bg-accent text-accent-foreground flex items-center justify-center rounded-full border text-xs',
									isMenuOpened ? 'h-8 w-8' : 'h-6 w-6',
								)}
							>
								<span
									className={cn(
										'pointer-events-none truncate text-center',
										isMenuOpened ? 'w-8' : 'w-6',
									)}
								>
									{isMenuOpened ? `+${numberOverLimit}` : numberOverLimit}
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent>{overLimitLabel}</TooltipContent>
					</Tooltip>
				) : null}
			</TooltipProvider>
		</div>
	)
}

function getLoggedInProductEmojis(
	hosts: string[] | null | undefined,
): string | null {
	if (!hosts || hosts.length === 0) return null
	return hosts
		.map((host) => productHostEmojis[host])
		.filter(Boolean)
		.join(' ')
}

function getUserLocations(user: User): Location[] {
	if (user.locations && user.locations.length > 0) {
		return user.locations.filter(Boolean) as Location[]
	}
	if (user.location) {
		return [user.location]
	}
	return []
}

function getUniqueProductHostEmojis(locations: Location[]): string | null {
	const uniqueHosts = new Set<string>()
	for (const loc of locations) {
		if (loc.productHost) {
			uniqueHosts.add(loc.productHost)
		}
	}
	if (uniqueHosts.size === 0) return null
	return Array.from(uniqueHosts)
		.map((host) => getProductHostEmoji(host))
		.filter(Boolean)
		.join('')
}

function hasExtras(apps: Array<{ relativePath: string }>) {
	return apps.some((app) => {
		const rootDir = app.relativePath.split(/[\\/]/)[0]
		return (
			rootDir === 'extra' || rootDir === 'example' || rootDir === 'examples'
		)
	})
}

const useIsWide = makeMediaQueryStore('(min-width: 640px)', true)

export default function App() {
	const data = useLoaderData<typeof loader>()
	const user = useOptionalUser()
	const isWide = useIsWide()
	const isHydrated = useHydrated()

	const [isMenuOpened, setMenuOpenedState] = React.useState(data.isMenuOpened)
	useRevalidationWS({
		watchPaths: [
			'./exercises/README.mdx',
			'./extra',
			'./example',
			'./examples',
		],
	})

	function setMenuOpened(value: boolean) {
		setMenuOpenedState(value)
		document.cookie = `es_menu_open=${value.toString()}; path=/; SameSite=Lax;`
	}

	return (
		<div className="flex flex-col">
			{user ? null : <NoUserBanner />}
			{/*
				this isn't placed in a conditional with isWide because the server render
				doesn't know whether it should be around or not so we just use CSS to hide it
				if it's not supposed to show up.

				We don't just use media queries for the wider screen nav because we want
				to avoid running all the logic in there unnecessarily.
			*/}
			{isHydrated && isWide ? null : (
				<MobileNavigation
					isMenuOpened={isMenuOpened}
					onMenuOpenChange={setMenuOpened}
				/>
			)}
			<div
				// this nonsense is here because we want the panels to be scrollable rather
				// than having the entire page be scrollable (at least on wider screens)
				className={cn('flex grow flex-col sm:flex-row', {
					'h-[calc(100vh-128px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:h-[calc(100vh-64px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]':
						!user,
					'h-[calc(100vh-64px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:h-[calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]':
						user,
					'h-[unset]': !isWide && isMenuOpened,
				})}
			>
				{isWide ? (
					<Navigation
						isMenuOpened={isMenuOpened}
						onMenuOpenChange={setMenuOpened}
					/>
				) : null}
				<div
					className={cn(
						'h-full w-full max-w-full sm:max-w-[calc(100%-56px)]',
						isMenuOpened ? 'hidden md:block' : '',
					)}
				>
					<Outlet />
				</div>
			</div>
		</div>
	)
}

function getLocationLabel(location: User['location']) {
	if (!location) return null

	const { exercise } = location

	const exercisePortion = [
		exercise
			? [exercise.exerciseNumber, exercise.stepNumber]
					.filter(Boolean)
					.map((s) => s.toString().padStart(2, '0'))
					.join('/')
			: null,
		exercise?.type,
	]
		.filter(Boolean)
		.join(' - ')
	return { line1: location.workshopTitle, line2: exercisePortion }
}

function NoUserBanner() {
	const isWide = useIsWide()
	const {
		product: { host, displayName },
	} = useWorkshopConfig()
	const userHasAccess = useUserHasAccess()
	const [showLoginBadge, dismissLoginBadge] =
		useOnboardingIndicator('login-button')
	const details = (
		<div>
			{ENV.EPICSHOP_DEPLOYED ? (
				<div>
					{`This is the deployed version. `}
					<>
						<Link
							className="underline"
							target="_blank"
							rel="noopener noreferrer"
							to={ENV.EPICSHOP_GITHUB_REPO}
						>
							Run locally
						</Link>
						{` for full experience.`}
					</>{' '}
				</div>
			) : userHasAccess ? (
				<div>
					<Link to="/login" className="underline">
						Login
					</Link>{' '}
					or{' '}
					<a href={`https://${host}/login`} className="underline">
						join for free
					</a>{' '}
					for the full experience.
				</div>
			) : null}
		</div>
	)
	return (
		<div className="from-highlight to-info text-info-foreground z-10 flex h-16 items-center justify-between border-b bg-linear-to-tr pl-4">
			{isWide ? (
				<>
					<div className="hidden flex-1 flex-wrap items-center gap-4 sm:flex">
						<Logo size="lg" style="monochrome" />
						<div className="flex flex-1 flex-wrap items-center">
							<p className="mr-2">
								Welcome to the{' '}
								<Link
									to={`https://${host}`}
									className="underline"
									target="_blank"
								>
									{displayName}
								</Link>{' '}
								Workshop app!
							</p>
							{details}
						</div>
					</div>
					{userHasAccess ? null : (
						<div className="hidden h-full flex-col items-center sm:flex md:flex-row">
							<Link
								to={`https://${host}`}
								target="_blank"
								className="flex h-full items-center justify-center space-x-1.5 px-5 text-sm font-semibold"
							>
								<span className="drop-shadow-sm">Join {displayName}</span>
								<span>↗︎</span>
							</Link>
							<Link
								to={ENV.EPICSHOP_DEPLOYED ? `https://${host}/login` : '/login'}
								className="bg-info-foreground/20 hover:bg-info-foreground/30 relative flex h-full items-center justify-center space-x-1.5 px-5 text-sm font-semibold shadow-md transition"
								onClick={dismissLoginBadge}
							>
								<Icon name="User" size="lg" />
								<span className="drop-shadow-sm">Login</span>
								{showLoginBadge ? (
									<OnboardingBadge
										tooltip="Login for the full experience!"
										size="sm"
									/>
								) : null}
							</Link>
						</div>
					)}
				</>
			) : (
				<>
					<div className="flex flex-1 flex-wrap items-center gap-4 sm:hidden">
						<a href={`https://${host}`}>
							<Logo size="lg" style="monochrome" />
						</a>
						<Dialog>
							<DialogTrigger>
								<Icon name="Question" size="lg" className="animate-pulse" />
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<Logo size="lg" style="monochrome" />
									<span className="text-lg font-semibold">{displayName}</span>
								</DialogHeader>
								<DialogDescription>
									Welcome to the{' '}
									<Link to={`https://${host}`} className="underline">
										{displayName}
									</Link>{' '}
									Workshop app!
								</DialogDescription>
								{details}
							</DialogContent>
						</Dialog>
					</div>
					{userHasAccess ? null : (
						<div className="flex h-full items-center">
							<Link
								to={`https://${host}`}
								target="_blank"
								className="flex h-full items-center justify-center space-x-1.5 px-5 text-sm font-semibold"
							>
								<span className="drop-shadow-sm">Join</span>
								<span>↗︎</span>
							</Link>
							<Link
								to={ENV.EPICSHOP_DEPLOYED ? `https://${host}/login` : '/login'}
								className="bg-info-foreground/20 hover:bg-info-foreground/30 relative flex h-full items-center justify-center space-x-1.5 px-5 text-sm font-semibold shadow-md transition"
								onClick={dismissLoginBadge}
							>
								<Icon name="User" size="lg" />
								<span className="drop-shadow-sm">Login</span>
								{showLoginBadge ? (
									<OnboardingBadge
										tooltip="Login for the full experience!"
										size="sm"
									/>
								) : null}
							</Link>
						</div>
					)}
				</>
			)}
		</div>
	)
}

const itemVariants = {
	hidden: { opacity: 0, x: -20 },
	visible: { opacity: 1, x: 0 },
}
function NavigationExerciseListItem({
	exerciseNumber,
	children,
}: {
	exerciseNumber: number
	children: React.ReactNode
}) {
	const progressClassName = useExerciseProgressClassName(exerciseNumber)
	return (
		<motion.li
			variants={itemVariants}
			className={cn(
				// add gap of 3 to children, but using padding so the progress extends through the whole height
				'py-[6px] first:pt-3 last:pb-3',
				progressClassName ? `${progressClassName} before:border-t` : null,
			)}
		>
			<span className="inline-block pl-2">{children}</span>
		</motion.li>
	)
}

function NavigationExerciseStepListItem({
	children,
	...progressItemSearch
}: {
	children: React.ReactNode
} & ProgressItemSearch) {
	const progressClassName = useProgressItemClassName(progressItemSearch)
	return (
		<motion.li
			variants={itemVariants}
			className={cn(
				// add gap of 3 to children, but using padding so the progress extends through the whole height
				'py-[6px] first:pt-3 last:pb-3',
				progressClassName ? `${progressClassName} before:border-t` : null,
			)}
		>
			<span className="inline-block pl-2">{children}</span>
		</motion.li>
	)
}

function NavigationExtrasListItem({ children }: { children: React.ReactNode }) {
	return (
		<motion.li
			variants={itemVariants}
			className="py-[6px] first:pt-3 last:pb-3"
		>
			<span className="inline-block pl-2">{children}</span>
		</motion.li>
	)
}

function MobileNavigation({
	isMenuOpened,
	onMenuOpenChange: setMenuOpened,
}: {
	isMenuOpened: boolean
	onMenuOpenChange: (change: boolean) => void
}) {
	const data = useLoaderData<typeof loader>()
	const apps = useApps()
	const user = useOptionalUser()
	const nextExerciseRoute = useNextExerciseRoute()
	const params = useParams()
	const location = useLocation()
	const isOnline = useIsOnline()
	const { users } = usePresence()

	// Onboarding indicators
	const [showAccountBadge, dismissAccountBadge] =
		useOnboardingIndicator('account-link')
	const showExtrasLink = hasExtras(apps)
	const playgroundExtra = data.extras.find(
		(extra) => extra.name === data.playground.appName,
	)
	const isExtrasActive =
		location.pathname === '/extra' || location.pathname.startsWith('/extra/')
	const showExtrasPlaygroundLink = Boolean(playgroundExtra) && !isExtrasActive

	// items
	const listVariants = {
		visible: {
			opacity: 1,
			transition: {
				duration: 0.05,
				when: 'beforeChildren',
				staggerChildren: 0.03,
			},
		},
		hidden: {
			opacity: 0,
		},
	}

	return (
		<nav className="flex w-full border-b sm:hidden">
			<div className="w-full">
				<div
					className={cn('flex items-center', {
						'flex-col': isMenuOpened,
						'h-14': !isMenuOpened,
					})}
				>
					<NavToggle
						title={data.workshopTitle}
						isMenuOpened={isMenuOpened}
						setMenuOpened={setMenuOpened}
					/>
					{isMenuOpened && (
						<motion.div
							className="scrollbar-thin scrollbar-thumb-scrollbar flex w-full grow flex-col justify-between overflow-x-auto p-6"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
						>
							<motion.ul
								variants={listVariants}
								initial="hidden"
								animate="visible"
								className="flex flex-col"
							>
								<span>
									<NavLink
										prefetch="intent"
										to="/"
										className={({ isActive }) =>
											clsx(
												'relative px-2 py-0.5 pr-3 text-2xl font-bold whitespace-nowrap outline-none hover:underline focus:underline',
												'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
												{ 'bg-foreground text-background': isActive },
											)
										}
									>
										Home
									</NavLink>
								</span>
								{data.exercises.map(({ exerciseNumber, title, steps }) => {
									const isActive =
										Number(params.exerciseNumber) === exerciseNumber
									const showPlayground =
										!isActive &&
										data.playground.exerciseNumber === exerciseNumber
									return (
										<NavigationExerciseListItem
											key={exerciseNumber}
											exerciseNumber={exerciseNumber}
										>
											<span className="flex items-center gap-1 text-2xl font-bold">
												<Link
													prefetch="intent"
													to={getExercisePath(exerciseNumber)}
													className={clsx(
														'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
														'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
														{ 'bg-foreground text-background': isActive },
													)}
												>
													{title}
												</Link>
												{showPlayground ? (
													<Link
														to={getExerciseStepPath(
															data.playground.exerciseNumber,
															data.playground.stepNumber,
															data.playground.type,
														)}
														prefetch="intent"
													>
														🛝
													</Link>
												) : null}
											</span>
											{isActive ? (
												<motion.ul
													variants={listVariants}
													initial="hidden"
													animate="visible"
													className="mt-2 ml-4 flex flex-col"
												>
													<NavigationExerciseStepListItem
														key={exerciseNumber}
														type="instructions"
														exerciseNumber={exerciseNumber}
													>
														<Link
															to={getExercisePath(exerciseNumber)}
															prefetch="intent"
															className={clsx(
																'after:bg-background relative px-2 py-0.5 pr-3 text-xl font-medium whitespace-nowrap outline-none after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																{
																	'bg-foreground text-background':
																		!params.stepNumber,
																},
															)}
														>
															Intro
														</Link>
													</NavigationExerciseStepListItem>
													{steps
														.filter(Boolean)
														.map(({ stepNumber, title, problem, solution }) => {
															return (
																<NavigationExerciseStepListItem
																	key={stepNumber}
																	type="step"
																	stepNumber={stepNumber}
																	exerciseNumber={exerciseNumber}
																>
																	<div className="flex flex-col gap-0.5">
																		<Link
																			to={getExerciseStepPath(
																				exerciseNumber,
																				stepNumber,
																			)}
																			prefetch="intent"
																			className="leading-tight font-semibold"
																		>
																			{stepNumber.toString().padStart(2, '0')}.{' '}
																			{title}
																		</Link>
																		<div className="mt-0.5 ml-3 flex gap-1">
																			{problem && (
																				<NavLink
																					to={getExerciseStepPath(
																						exerciseNumber,
																						stepNumber,
																						'problem',
																					)}
																					prefetch="intent"
																					className={({ isActive }) =>
																						clsx(
																							'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
																							'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																							{
																								'bg-foreground text-background':
																									isActive,
																							},
																						)
																					}
																				>
																					Problem
																					{problem.name ===
																					data.playground.appName
																						? ' 🛝'
																						: ''}
																				</NavLink>
																			)}
																			{solution && (
																				<NavLink
																					to={getExerciseStepPath(
																						exerciseNumber,
																						stepNumber,
																						'solution',
																					)}
																					prefetch="intent"
																					className={({ isActive }) =>
																						clsx(
																							'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
																							'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																							{
																								'bg-foreground text-background':
																									isActive,
																							},
																						)
																					}
																				>
																					Solution
																					{solution.name ===
																					data.playground.appName
																						? ' 🛝'
																						: ''}
																				</NavLink>
																			)}
																		</div>
																	</div>
																</NavigationExerciseStepListItem>
															)
														})}
													<NavigationExerciseStepListItem
														type="finished"
														exerciseNumber={exerciseNumber}
													>
														<NavLink
															to={getExercisePath(exerciseNumber, 'finished')}
															prefetch="intent"
															className={({ isActive }) =>
																clsx(
																	'after:bg-background relative px-2 py-0.5 pr-3 text-base font-medium whitespace-nowrap outline-none after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																	{
																		'bg-foreground text-background': isActive,
																	},
																)
															}
														>
															📝 Elaboration
														</NavLink>
													</NavigationExerciseStepListItem>
												</motion.ul>
											) : null}
										</NavigationExerciseListItem>
									)
								})}
								{showExtrasLink ? (
									<span>
										<span className="flex items-center gap-1 text-2xl font-bold">
											<NavLink
												to="/extra"
												prefetch="intent"
												className={({ isActive }) =>
													clsx(
														'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
														'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
														{ 'bg-foreground text-background': isActive },
													)
												}
											>
												📚 Extras
											</NavLink>
											{showExtrasPlaygroundLink && playgroundExtra ? (
												<Link
													to={`/extra/${playgroundExtra.dirName}`}
													prefetch="intent"
												>
													🛝
												</Link>
											) : null}
										</span>
										{isExtrasActive && data.extras.length ? (
											<motion.ul
												variants={listVariants}
												initial="hidden"
												animate="visible"
												className="mt-2 ml-4 flex flex-col"
											>
												{data.extras.map((extra) => (
													<NavigationExtrasListItem key={extra.dirName}>
														<NavLink
															to={`/extra/${extra.dirName}`}
															prefetch="intent"
															className={({ isActive }) =>
																clsx(
																	'leading-tight font-semibold',
																	isActive ? 'underline' : null,
																)
															}
														>
															{extra.title}
															{extra.name === data.playground.appName
																? ' 🛝'
																: ''}
														</NavLink>
													</NavigationExtrasListItem>
												))}
											</motion.ul>
										) : null}
									</span>
								) : null}
							</motion.ul>
							<div className="mt-6">
								<NavLink
									to="/finished"
									className={({ isActive }) =>
										clsx(
											'relative text-lg font-bold whitespace-nowrap outline-none hover:underline focus:underline',
											{
												'after:bg-background bg-foreground text-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""]':
													isActive,
											},
										)
									}
								>
									📝 Workshop Feedback
								</NavLink>
							</div>
						</motion.div>
					)}
					<div className="grow" />
					{isOnline ? null : (
						<SimpleTooltip content={isMenuOpened ? null : 'You are offline'}>
							<div
								className={cn(
									'flex h-14 animate-pulse items-center justify-start p-4',
									isMenuOpened ? 'w-full border-t' : 'border-l',
								)}
							>
								<Icon
									name="WifiNoConnection"
									className="text-foreground-destructive"
								>
									{isMenuOpened ? 'You are offline' : null}
								</Icon>
							</div>
						</SimpleTooltip>
					)}
					<div
						className={cn(
							'flex items-center justify-start p-4',
							isMenuOpened && users.length > 4 ? 'min-h-14' : 'h-14',
							isMenuOpened ? 'w-full border-t' : 'border-l',
						)}
					>
						<FacePile isMenuOpened={isMenuOpened} />
					</div>
					{ENV.EPICSHOP_DEPLOYED ? null : user ? (
						<SimpleTooltip content={isMenuOpened ? null : 'Your account'}>
							<Link
								className={cn(
									'relative flex h-14 shrink-0 items-center justify-start space-x-3 px-4 py-4 text-center no-underline hover:underline',
									{
										'border-l': !isMenuOpened,
										'w-full border-t': isMenuOpened,
									},
								)}
								to="/account"
								onClick={dismissAccountBadge}
							>
								{user.imageUrlSmall ? (
									<img
										alt={user.name ?? user.email}
										src={user.imageUrlSmall}
										className="h-full rounded-full"
									/>
								) : (
									<Icon name="User" className="shrink-0" size="lg" />
								)}
								{isMenuOpened ? (
									<motion.div
										className="flex items-center whitespace-nowrap"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
									>
										Your Account
									</motion.div>
								) : (
									<span className="sr-only">Your account</span>
								)}
								{showAccountBadge ? (
									<OnboardingBadge
										tooltip="View your account and preferences"
										size="sm"
									/>
								) : null}
							</Link>
						</SimpleTooltip>
					) : null}
					{ENV.EPICSHOP_DEPLOYED ? null : user && nextExerciseRoute ? (
						<SimpleTooltip
							content={isMenuOpened ? null : 'Continue to next lesson'}
						>
							<Link
								to={nextExerciseRoute}
								prefetch="intent"
								className={clsx(
									'flex h-14 w-full items-center space-x-3 border-l px-4 py-4 pl-[18px] no-underline hover:underline',
								)}
								state={{ from: 'continue next lesson button' }}
							>
								<Icon name="FastForward" className="shrink-0" size="md" />
								{isMenuOpened ? (
									<motion.div
										className="flex items-center whitespace-nowrap"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
									>
										Continue to next lesson
									</motion.div>
								) : (
									<span className="sr-only">Continue to next lesson</span>
								)}
							</Link>
						</SimpleTooltip>
					) : null}
					<div
						className={cn(
							'flex h-14 w-14 items-center justify-center self-start p-4 sm:mb-4 sm:w-full',
							{
								'w-full border-t': isMenuOpened,
								'border-l': !isMenuOpened,
							},
						)}
					>
						<ThemeSwitch />
					</div>
				</div>
			</div>
		</nav>
	)
}

const OPENED_MENU_WIDTH = 400

function Navigation({
	isMenuOpened,
	onMenuOpenChange: setMenuOpened,
}: {
	isMenuOpened: boolean
	onMenuOpenChange: (change: boolean) => void
}) {
	const data = useLoaderData<typeof loader>()
	const apps = useApps()
	const user = useOptionalUser()
	const nextExerciseRoute = useNextExerciseRoute()
	const params = useParams()
	const location = useLocation()
	const isOnline = useIsOnline()
	const { users } = usePresence()

	// Onboarding indicators
	const [showAccountBadge, dismissAccountBadge] =
		useOnboardingIndicator('account-link')
	const showExtrasLink = hasExtras(apps)
	const playgroundExtra = data.extras.find(
		(extra) => extra.name === data.playground.appName,
	)
	const isExtrasActive =
		location.pathname === '/extra' || location.pathname.startsWith('/extra/')
	const showExtrasPlaygroundLink = Boolean(playgroundExtra) && !isExtrasActive

	const exercise = data.exercises.find(
		(e) => e.exerciseNumber === Number(params.exerciseNumber),
	)
	const app =
		params.type === 'solution'
			? exercise?.solutions.find(
					(s) => s.stepNumber === Number(params.stepNumber),
				)
			: params.type === 'problem'
				? exercise?.problems.find(
						(p) => p.stepNumber === Number(params.stepNumber),
					)
				: null

	// container
	const menuControls = useAnimationControls()
	const menuVariants = {
		close: { width: 56 },
		open: { width: OPENED_MENU_WIDTH },
	}

	// items
	const listVariants = {
		visible: {
			opacity: 1,
			transition: {
				duration: 0.05,
				when: 'beforeChildren',
				staggerChildren: 0.03,
			},
		},
		hidden: {
			opacity: 0,
		},
	}

	const handleOpenShortcuts = React.useCallback(() => {
		if (typeof window === 'undefined') return
		window.dispatchEvent(new CustomEvent('toggle-keyboard-shortcuts'))
	}, [])

	return (
		<nav className="hidden border-r sm:flex">
			<motion.div
				initial={isMenuOpened ? 'open' : 'close'}
				variants={menuVariants}
				animate={menuControls}
			>
				<div className="flex h-full flex-col items-center justify-between">
					<NavToggle
						title={data.workshopTitle}
						menuControls={menuControls}
						isMenuOpened={isMenuOpened}
						setMenuOpened={setMenuOpened}
					/>
					{isMenuOpened && (
						<motion.div
							style={{ width: OPENED_MENU_WIDTH }}
							className="scrollbar-thin scrollbar-thumb-scrollbar flex grow flex-col justify-between overflow-y-auto p-6"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
						>
							<motion.ul
								variants={listVariants}
								initial="hidden"
								animate="visible"
								className="flex flex-col"
							>
								<span>
									<NavLink
										prefetch="intent"
										to="/"
										className={({ isActive }) =>
											clsx(
												'relative px-2 py-0.5 pr-3 text-2xl font-bold whitespace-nowrap outline-none hover:underline focus:underline',
												'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
												{ 'bg-foreground text-background': isActive },
											)
										}
									>
										Home
									</NavLink>
								</span>
								{data.exercises.map(({ exerciseNumber, title, steps }) => {
									const isActive =
										Number(params.exerciseNumber) === exerciseNumber
									const showPlayground =
										!isActive &&
										data.playground.exerciseNumber === exerciseNumber
									return (
										<NavigationExerciseListItem
											key={exerciseNumber}
											exerciseNumber={exerciseNumber}
										>
											<span className="flex items-center gap-1 text-2xl font-bold">
												<Link
													prefetch="intent"
													to={getExercisePath(exerciseNumber)}
													className={clsx(
														'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
														'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
														{ 'bg-foreground text-background': isActive },
													)}
												>
													{title}
												</Link>
												{showPlayground ? (
													<Link
														to={getExerciseStepPath(
															data.playground.exerciseNumber,
															data.playground.stepNumber,
															data.playground.type,
														)}
														prefetch="intent"
													>
														🛝
													</Link>
												) : null}
											</span>
											{isActive ? (
												<motion.ul
													variants={listVariants}
													initial="hidden"
													animate="visible"
													className="mt-2 ml-4 flex flex-col"
												>
													<NavigationExerciseStepListItem
														key={exerciseNumber}
														type="instructions"
														exerciseNumber={exerciseNumber}
													>
														<Link
															to={getExercisePath(exerciseNumber)}
															prefetch="intent"
															className={clsx(
																'after:bg-background relative px-2 py-0.5 pr-3 text-xl font-medium whitespace-nowrap outline-none after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																{
																	'bg-foreground text-background':
																		!params.stepNumber,
																},
															)}
														>
															Intro
														</Link>
													</NavigationExerciseStepListItem>
													{steps
														.filter(Boolean)
														.map(({ stepNumber, title, problem, solution }) => {
															return (
																<NavigationExerciseStepListItem
																	key={stepNumber}
																	type="step"
																	stepNumber={stepNumber}
																	exerciseNumber={exerciseNumber}
																>
																	<div className="flex flex-col gap-0.5">
																		<Link
																			to={getExerciseStepPath(
																				exerciseNumber,
																				stepNumber,
																			)}
																			prefetch="intent"
																			className="leading-tight font-semibold"
																		>
																			{stepNumber.toString().padStart(2, '0')}.{' '}
																			{title}
																		</Link>
																		<div className="mt-0.5 ml-3 flex gap-1">
																			{problem && (
																				<NavLink
																					to={getExerciseStepPath(
																						exerciseNumber,
																						stepNumber,
																						'problem',
																					)}
																					prefetch="intent"
																					className={({ isActive }) =>
																						clsx(
																							'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
																							'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																							{
																								'bg-foreground text-background':
																									isActive,
																							},
																						)
																					}
																				>
																					Problem
																					{problem.name ===
																					data.playground.appName
																						? ' 🛝'
																						: ''}
																				</NavLink>
																			)}
																			{solution && (
																				<NavLink
																					to={getExerciseStepPath(
																						exerciseNumber,
																						stepNumber,
																						'solution',
																					)}
																					prefetch="intent"
																					className={({ isActive }) =>
																						clsx(
																							'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
																							'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																							{
																								'bg-foreground text-background':
																									isActive,
																							},
																						)
																					}
																				>
																					Solution
																					{solution.name ===
																					data.playground.appName
																						? ' 🛝'
																						: ''}
																				</NavLink>
																			)}
																		</div>
																	</div>
																</NavigationExerciseStepListItem>
															)
														})}
													<NavigationExerciseStepListItem
														type="finished"
														exerciseNumber={exerciseNumber}
													>
														<NavLink
															to={getExercisePath(exerciseNumber, 'finished')}
															prefetch="intent"
															className={({ isActive }) =>
																clsx(
																	'after:bg-background relative px-2 py-0.5 pr-3 text-base font-medium whitespace-nowrap outline-none after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
																	{
																		'bg-foreground text-background': isActive,
																	},
																)
															}
														>
															📝 Elaboration
														</NavLink>
													</NavigationExerciseStepListItem>
												</motion.ul>
											) : null}
										</NavigationExerciseListItem>
									)
								})}
								{showExtrasLink ? (
									<span>
										<span className="flex items-center gap-1 text-2xl font-bold">
											<NavLink
												to="/extra"
												prefetch="intent"
												className={({ isActive }) =>
													clsx(
														'relative px-2 py-0.5 pr-3 whitespace-nowrap outline-none hover:underline focus:underline',
														'after:bg-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""] hover:underline focus:underline',
														{ 'bg-foreground text-background': isActive },
													)
												}
											>
												📚 Extras
											</NavLink>
											{showExtrasPlaygroundLink && playgroundExtra ? (
												<Link
													to={`/extra/${playgroundExtra.dirName}`}
													prefetch="intent"
												>
													🛝
												</Link>
											) : null}
										</span>
										{isExtrasActive && data.extras.length ? (
											<motion.ul
												variants={listVariants}
												initial="hidden"
												animate="visible"
												className="mt-2 ml-4 flex flex-col"
											>
												{data.extras.map((extra) => (
													<NavigationExtrasListItem key={extra.dirName}>
														<NavLink
															to={`/extra/${extra.dirName}`}
															prefetch="intent"
															className={({ isActive }) =>
																clsx(
																	'leading-tight font-semibold',
																	isActive ? 'underline' : null,
																)
															}
														>
															{extra.title}
															{extra.name === data.playground.appName
																? ' 🛝'
																: ''}
														</NavLink>
													</NavigationExtrasListItem>
												))}
											</motion.ul>
										) : null}
									</span>
								) : null}
							</motion.ul>
							<div className="mt-6">
								<NavLink
									to="/finished"
									className={({ isActive }) =>
										clsx(
											'relative text-lg font-bold whitespace-nowrap outline-none hover:underline focus:underline',
											{
												'after:bg-background bg-foreground text-background after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:scale-75 after:rotate-45 after:content-[""]':
													isActive,
											},
										)
									}
								>
									📝 Workshop Feedback
								</NavLink>
							</div>
						</motion.div>
					)}
					{!isMenuOpened && (
						<div className="flex grow flex-col justify-center">
							<div className="orientation-sideways w-full font-mono text-sm leading-none font-medium uppercase">
								{exercise?.title ? (
									<Link to={getExercisePath(Number(params.exerciseNumber))}>
										{exercise.title}
									</Link>
								) : null}
								{exercise?.title && app?.title ? ' — ' : null}
								{app?.title ? (
									<Link
										to={getExerciseStepPath(
											Number(params.exerciseNumber),
											app.stepNumber,
										)}
									>
										{app.title}
									</Link>
								) : null}
							</div>
						</div>
					)}
					{isOnline ? null : (
						<SimpleTooltip content={isMenuOpened ? null : 'You are offline'}>
							<div
								className={cn(
									'flex w-full animate-pulse items-center border-t p-4',
									isMenuOpened ? 'justify-start' : 'justify-center',
								)}
							>
								<Icon
									name="WifiNoConnection"
									className="text-foreground-destructive"
								>
									{isMenuOpened ? (
										<span className="whitespace-nowrap">You are offline</span>
									) : null}
								</Icon>
							</div>
						</SimpleTooltip>
					)}
					<div
						className={cn(
							'flex w-full items-center justify-start border-t p-4 transition-[height]',
							isMenuOpened && users.length > 4 ? 'h-28' : 'h-14',
						)}
						style={isMenuOpened ? { width: OPENED_MENU_WIDTH } : {}}
					>
						<FacePile isMenuOpened={isMenuOpened} />
					</div>
					{ENV.EPICSHOP_DEPLOYED ? null : user ? (
						<SimpleTooltip content={isMenuOpened ? null : 'Your account'}>
							<Link
								className="relative flex h-14 w-full shrink-0 items-center justify-start space-x-3 border-t px-4 py-4 text-center no-underline hover:underline"
								to="/account"
								onClick={dismissAccountBadge}
							>
								{user.imageUrlSmall ? (
									<img
										alt={user.name ?? user.email}
										src={user.imageUrlSmall}
										className="h-full rounded-full"
									/>
								) : (
									<Icon name="User" className="shrink-0" size="lg" />
								)}
								{isMenuOpened ? (
									<motion.div
										className="flex items-center whitespace-nowrap"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
									>
										Your Account
									</motion.div>
								) : (
									<span className="sr-only">Your account</span>
								)}
								{showAccountBadge ? (
									<OnboardingBadge
										tooltip="View your account and preferences"
										size="sm"
									/>
								) : null}
							</Link>
						</SimpleTooltip>
					) : null}
					{ENV.EPICSHOP_DEPLOYED ? null : user && nextExerciseRoute ? (
						<SimpleTooltip
							content={isMenuOpened ? null : 'Continue to next lesson'}
						>
							<Link
								to={nextExerciseRoute}
								prefetch="intent"
								className={clsx(
									'flex h-14 w-full items-center space-x-3 border-t px-4 py-4 pl-[18px] no-underline hover:underline',
								)}
								state={{ from: 'continue next lesson button' }}
							>
								<Icon name="FastForward" className="shrink-0" size="md" />
								{isMenuOpened ? (
									<motion.div
										className="flex items-center whitespace-nowrap"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
									>
										Continue to next lesson
									</motion.div>
								) : (
									<span className="sr-only">Continue to next lesson</span>
								)}
							</Link>
						</SimpleTooltip>
					) : null}
					<div className="mb-4 w-full self-start border-t pt-[15px] pl-3">
						<div className="flex items-center gap-2">
							<ThemeSwitch />
							{isMenuOpened ? (
								<SimpleTooltip content="Keyboard shortcuts (press ?)">
									<button
										type="button"
										aria-label="Keyboard shortcuts"
										onClick={handleOpenShortcuts}
										className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
									>
										<Icon name="Question" size="md" />
									</button>
								</SimpleTooltip>
							) : null}
						</div>
					</div>
				</div>
			</motion.div>
		</nav>
	)
}

function NavToggle({
	title,
	isMenuOpened,
	setMenuOpened,
	menuControls,
}: {
	title: string
	isMenuOpened: boolean
	setMenuOpened: (value: boolean) => void
	menuControls?: ReturnType<typeof useAnimationControls>
}) {
	const initialOpenRef = React.useRef(isMenuOpened)
	const menuButtonRef = React.useRef<HTMLButtonElement>(null)
	const path01Variants = {
		open: { d: 'M3.06061 2.99999L21.0606 21' },
		closed: { d: 'M0 9.5L24 9.5' },
	}
	const path02Variants = {
		open: { d: 'M3.00006 21.0607L21 3.06064' },
		moving: { d: 'M0 14.5L24 14.5' },
		closed: { d: 'M0 14.5L15 14.5' },
	}
	const path01Controls = useAnimationControls()
	const path02Controls = useAnimationControls()

	async function toggleMenu() {
		void menuControls?.start(isMenuOpened ? 'close' : 'open')
		setMenuOpened(!isMenuOpened)
		if (isMenuOpened) {
			void path01Controls.start(path01Variants.closed)
			await path02Controls.start(path02Variants.moving)
			void path02Controls.start(path02Variants.closed)
		} else {
			await path02Controls.start(path02Variants.moving)
			void path01Controls.start(path01Variants.open)
			void path02Controls.start(path02Variants.open)
		}
	}

	React.useEffect(() => {
		if (!isMenuOpened) return

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== 'Escape' || event.defaultPrevented) {
				return
			}

			const hasOpenDialog = Boolean(
				document.querySelector(
					'[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
				),
			)

			if (!hasOpenDialog) {
				menuButtonRef.current?.click()
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [isMenuOpened])

	return (
		<div
			className={cn(
				'relative inline-flex h-14 shrink-0 items-center justify-between overflow-hidden border-r sm:w-full sm:border-r-0 sm:border-b',
				{
					'w-full': isMenuOpened,
				},
			)}
		>
			<button
				ref={menuButtonRef}
				className="flex h-14 w-14 items-center justify-center"
				aria-label="Open Navigation menu"
				onClick={toggleMenu}
			>
				<svg width="24" height="24" viewBox="0 0 24 24">
					<motion.path
						{...path01Variants[initialOpenRef.current ? 'open' : 'closed']}
						animate={path01Controls}
						transition={{ duration: 0.2 }}
						stroke="currentColor"
						strokeWidth={1.5}
					/>
					<motion.path
						{...path02Variants[initialOpenRef.current ? 'open' : 'closed']}
						animate={path02Controls}
						transition={{ duration: 0.2 }}
						stroke="currentColor"
						strokeWidth={1.5}
					/>
				</svg>
			</button>
			{isMenuOpened && (
				<motion.p
					transition={{ delay: 0.2 }}
					initial={{ opacity: 0, y: 5 }}
					animate={{ opacity: 1, y: 0 }}
					className="absolute right-5 font-mono text-sm whitespace-nowrap uppercase"
				>
					<Link to="/">{title}</Link>
				</motion.p>
			)}
		</div>
	)
}
