import {
	type DataFunctionArgs,
	type HeadersFunction,
	json,
} from '@remix-run/node'
import {
	Link,
	NavLink,
	Outlet,
	useLoaderData,
	useParams,
} from '@remix-run/react'
import { clsx } from 'clsx'
import {
	type AnimationControls,
	motion,
	useAnimationControls,
} from 'framer-motion'
import * as React from 'react'
import { Icon } from '#app/components/icons.tsx'
import {
	SimpleTooltip,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { useOptionalUser } from '#app/components/user.tsx'
import {
	extractNumbersFromAppName,
	getExercises,
	getPlaygroundAppName,
	getWorkshopTitle,
} from '#app/utils/apps.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { type User, usePresence } from '#app/utils/presence.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '#app/utils/timing.server.ts'
import {
	useNextExerciseRoute,
	useExerciseProgressClassName,
	type ProgressItemSearch,
	useProgressItemClassName,
} from '../progress.tsx'
import { ThemeSwitch } from '../theme/index.tsx'

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('stepLoader')
	const [exercises, workshopTitle, playgroundAppName] = await Promise.all([
		getExercises({ request, timings }),
		getWorkshopTitle(),
		getPlaygroundAppName(),
	])

	const playground = {
		appName: playgroundAppName,
		exerciseNumber: Number(
			extractNumbersFromAppName(playgroundAppName ?? '').exerciseNumber,
		),
	}

	const result = json(
		{
			workshopTitle,
			exercises: exercises.map(e => ({
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
				})),
			})),
			playground,
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
		'shadow-purple-700 hover:opacity-100 focus:opacity-100 dark:shadow-purple-200',
		opacities[opacityNumber] ?? 'opacity-60',
		shadows[shadowNumber] ?? 'shadow-none',
		score === 1 ? 'animate-pulse hover:animate-none focus:animate-none' : null,
	)
}

function FacePile({ isMenuOpened }: { isMenuOpened: boolean }) {
	const loggedInUser = useOptionalUser()
	let { users } = usePresence()
	const limit = isMenuOpened ? 17 : 0
	const numberOverLimit = users.length - limit
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
					src="https://github-production-user-asset-6210df.s3.amazonaws.com/1500684/277090714-b26e5961-4ee5-4c20-abdb-b04c1c480f2b.png"
				/>
			</Link>
		) : null
	const overLimitLabel = `${numberOverLimit}${
		isMenuOpened ? ' more ' : ' '
	}Epic Web Dev${numberOverLimit === 1 ? '' : 's'} working now`
	return (
		<div className="flex flex-wrap items-center gap-2">
			<TooltipProvider>
				{users.slice(0, limit).map(({ user, score }) => {
					const scoreClassNames = getScoreClassNames(score)
					const locationLabel = getLocationLabel(user.location)
					return (
						<Tooltip key={user.id}>
							<TooltipTrigger asChild>
								{user.avatarUrl ? (
									<img
										tabIndex={0}
										alt={user.name || 'Epic Web Dev'}
										className={cn(
											'h-8 w-8 rounded-full border object-cover',
											scoreClassNames,
										)}
										src={user.avatarUrl}
									/>
								) : (
									<div
										tabIndex={0}
										aria-label={user.name || 'Epic Web Dev'}
										className={cn(
											'flex h-8 w-8 items-center justify-center rounded-full border',
											scoreClassNames,
										)}
									>
										<Icon name="User" />
									</div>
								)}
							</TooltipTrigger>
							<TooltipContent>
								<span className="flex flex-col items-center justify-center gap-1">
									<span>
										{user.name || 'An EPIC Web Dev'}{' '}
										{locationLabel
											? ` is working ${
													score === 1 && loggedInUser?.id !== user.id
														? 'with you'
														: ''
											  } on`
											: null}
									</span>
									{locationLabel?.line1 ? (
										<span>{locationLabel.line1}</span>
									) : null}
									{locationLabel?.line2 ? (
										<span>{locationLabel.line2}</span>
									) : null}
								</span>
							</TooltipContent>
						</Tooltip>
					)
				})}
				{tiffany}
				{numberOverLimit > 0 ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<div
								tabIndex={0}
								aria-label={overLimitLabel}
								className={cn(
									'flex items-center justify-center rounded-full border bg-accent text-xs text-accent-foreground',
									isMenuOpened ? 'h-8 w-8' : 'h-6 w-6',
								)}
							>
								<span
									className={cn(
										'pointer-events-none overflow-hidden text-ellipsis whitespace-nowrap text-center',
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

export default function App() {
	const user = null // useOptionalUser()
	// ENV.KCDSHOP_DEPLOYED = true

	const [isMenuOpened, setMenuOpened] = React.useState(false)

	return (
		<div className="flex flex-col">
			{user ? null : <EpicWebBanner />}
			<div
				className={cn('flex flex-grow', {
					'h-[calc(100vh-64px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]':
						!user,
					'h-[calc(100vh-112px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:h-[calc(100vh-64px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]':
						ENV.KCDSHOP_DEPLOYED,
					'h-[calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]':
						user,
				})}
			>
				<Navigation
					isMenuOpened={isMenuOpened}
					onMenuOpenChange={setMenuOpened}
				/>
				<div
					className={cn('h-full w-full', isMenuOpened ? 'hidden md:block' : '')}
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
					.map(s => s.toString().padStart(2, '0'))
					.join('/')
			: null,
		exercise?.type,
	]
		.filter(Boolean)
		.join(' - ')
	return { line1: location.workshopTitle, line2: exercisePortion }
}

function EpicWebBanner() {
	return (
		<div
			className={cn(
				'z-10 flex items-center justify-between border-b bg-gradient-to-tr from-blue-500 to-indigo-500 pl-4 text-white',
				ENV.KCDSHOP_DEPLOYED ? 'h-[112px] md:h-[64px]' : 'h-16',
			)}
		>
			<div className="flex flex-1 flex-wrap items-center gap-4">
				<Icon name="EpicWeb" size={24} />
				<div className="flex flex-1 flex-wrap items-center">
					<p className="mr-2">
						Welcome to the{' '}
						<Link
							to="https://www.epicweb.dev"
							className="underline"
							target="_blank"
						>
							EpicWeb.dev
						</Link>{' '}
						Workshop app!
					</p>
					{ENV.KCDSHOP_DEPLOYED ? (
						<small className="text-sm">
							This is the deployed version.{' '}
							<Link
								className="underline"
								target="_blank"
								rel="noopener noreferrer"
								to={ENV.KCDSHOP_GITHUB_ROOT}
							>
								Run locally
							</Link>{' '}
							for full experience.
						</small>
					) : null}
				</div>
			</div>
			<div className="flex h-full flex-col items-center md:flex-row">
				<Link
					to="https://www.epicweb.dev"
					target="_blank"
					className="flex h-full items-center justify-center space-x-1.5 px-5 text-sm font-semibold"
				>
					<span className="drop-shadow-sm">Buy Epic Web</span>
					<span>↗︎</span>
				</Link>
				<Link
					to={ENV.KCDSHOP_DEPLOYED ? 'https://www.epicweb.dev/login' : '/login'}
					className="flex h-full items-center justify-center space-x-1.5 bg-white/20 px-5 text-sm font-semibold shadow-md transition hover:bg-white/30"
				>
					<Icon name="User" size={24} />
					<span className="drop-shadow-sm">Restore Purchase</span>
				</Link>
			</div>
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
				progressClassName
					? `${progressClassName} border-border before:border-t`
					: null,
			)}
		>
			<span className="ml-2">{children}</span>
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
				progressClassName
					? `${progressClassName} border-border before:border-t`
					: null,
			)}
		>
			<span className="ml-2">{children}</span>
		</motion.li>
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
	const user = useOptionalUser()
	const nextExerciseRoute = useNextExerciseRoute()
	const params = useParams()
	const { users } = usePresence()

	const exercise = data.exercises.find(
		e => e.exerciseNumber === Number(params.exerciseNumber),
	)
	const app =
		params.type === 'solution'
			? exercise?.solutions.find(
					s => s.stepNumber === Number(params.stepNumber),
			  )
			: params.type === 'problem'
			  ? exercise?.problems.find(
						p => p.stepNumber === Number(params.stepNumber),
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
	const exNum = Number(params.exerciseNumber).toString().padStart(2, '0')

	return (
		<nav className="flex border-r border-border">
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
							className="flex flex-grow flex-col justify-between overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-scrollbar"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
						>
							<motion.ul
								variants={listVariants}
								initial="hidden"
								animate="visible"
								className="flex flex-col"
							>
								{data.exercises.map(({ exerciseNumber, title, steps }) => {
									const isActive =
										Number(params.exerciseNumber) === exerciseNumber
									const showPlayground =
										!isActive &&
										data.playground.exerciseNumber === exerciseNumber
									const exerciseNum = exerciseNumber.toString().padStart(2, '0')
									return (
										<NavigationExerciseListItem
											key={exerciseNumber}
											exerciseNumber={exerciseNumber}
										>
											<Link
												prefetch="intent"
												to={`/${exerciseNum}`}
												className={clsx(
													'relative whitespace-nowrap px-2 py-0.5 pr-3 text-2xl font-bold outline-none hover:underline focus:underline',
													'after:absolute after:-bottom-2.5 after:-right-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-background after:content-[""] hover:underline focus:underline',
													{ 'bg-foreground text-background': isActive },
												)}
											>
												{title}
												{showPlayground ? ' 🛝' : null}
											</Link>
											{isActive && (
												<motion.ul
													variants={listVariants}
													initial="hidden"
													animate="visible"
													className="ml-4 mt-4 flex flex-col"
												>
													<NavigationExerciseStepListItem
														key={exerciseNumber}
														type="instructions"
														exerciseNumber={exerciseNumber}
													>
														<Link
															to={`/${exerciseNum}`}
															prefetch="intent"
															className={clsx(
																'relative whitespace-nowrap px-2 py-0.5 pr-3 text-xl font-medium outline-none after:absolute after:-bottom-2.5 after:-right-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-background after:content-[""] hover:underline focus:underline',
																{
																	'bg-foreground text-background':
																		isActive && !params.stepNumber,
																},
															)}
														>
															Intro
														</Link>
													</NavigationExerciseStepListItem>
													{steps
														.filter(Boolean)
														.map(({ name, stepNumber, title }) => {
															const isActive =
																Number(params.stepNumber) === stepNumber
															const step = stepNumber
																.toString()
																.padStart(2, '0')
															const isPlayground =
																name === data.playground.appName
															return (
																<NavigationExerciseStepListItem
																	key={stepNumber}
																	type="step"
																	stepNumber={stepNumber}
																	exerciseNumber={exerciseNumber}
																>
																	<Link
																		to={`/${exerciseNum}/${step}`}
																		prefetch="intent"
																		className={clsx(
																			'relative whitespace-nowrap px-2 py-0.5 pr-3 text-xl font-medium outline-none after:absolute after:-bottom-2.5 after:-right-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-background after:content-[""] hover:underline focus:underline',
																			{
																				'bg-foreground text-background':
																					isActive,
																			},
																		)}
																	>
																		{isPlayground
																			? `${step}. ${title} 🛝`
																			: `${step}. ${title}`}
																	</Link>
																</NavigationExerciseStepListItem>
															)
														})}
													<NavigationExerciseStepListItem
														type="finished"
														exerciseNumber={exerciseNumber}
													>
														<NavLink
															to={`/${exerciseNum}/finished`}
															prefetch="intent"
															className={({ isActive }) =>
																clsx(
																	'relative whitespace-nowrap px-2 py-0.5 pr-3 text-base font-medium outline-none after:absolute after:-bottom-2.5 after:-right-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-background after:content-[""] hover:underline focus:underline',
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
											)}
										</NavigationExerciseListItem>
									)
								})}
							</motion.ul>
							<div className="mt-6">
								<NavLink
									to="/finished"
									className={({ isActive }) =>
										clsx(
											'relative whitespace-nowrap text-lg font-bold outline-none hover:underline focus:underline',
											{
												'bg-black text-white after:absolute after:-bottom-2.5 after:-right-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-background after:content-[""]':
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
						<div className="flex flex-grow flex-col justify-center">
							<div className="orientation-sideways w-full font-mono text-sm font-medium uppercase leading-none">
								{exercise?.title ? (
									<Link to={`/${exNum}`}>{exercise.title}</Link>
								) : null}
								{exercise?.title && app?.title ? ' — ' : null}
								{app?.title ? (
									<Link
										to={`/${exNum}/${app.stepNumber
											.toString()
											.padStart(2, '0')}`}
									>
										{app.title}
									</Link>
								) : null}
							</div>
						</div>
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
					{ENV.KCDSHOP_DEPLOYED ? null : user ? (
						<SimpleTooltip content={isMenuOpened ? null : 'Your account'}>
							<Link
								className="flex h-14 w-full items-center justify-start space-x-3 border-t px-4 py-4 text-center no-underline hover:underline"
								to="/account"
							>
								{user.avatarUrl ? (
									<img
										alt={user.name ?? user.email}
										src={user.avatarUrl}
										className="h-full rounded-full"
									/>
								) : (
									<Icon name="User" className="flex-shrink-0" size={24} />
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
							</Link>
						</SimpleTooltip>
					) : null}
					{ENV.KCDSHOP_DEPLOYED ? null : user && nextExerciseRoute ? (
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
								<Icon name="FastForward" className="flex-shrink-0" size={20} />
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
					<div className="mb-4 w-full self-start border-t pl-3 pt-[15px]">
						<ThemeSwitch />
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
	menuControls: AnimationControls
}) {
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

	return (
		<div className="relative inline-flex h-14 w-full items-center justify-between overflow-hidden border-b border-border">
			<button
				className="flex h-14 w-14 items-center justify-center"
				aria-label="Open Navigation menu"
				onClick={async () => {
					menuControls.start(isMenuOpened ? 'close' : 'open')
					setMenuOpened(!isMenuOpened)
					if (!isMenuOpened) {
						await path02Controls.start(path02Variants.moving)
						path01Controls.start(path01Variants.open)
						path02Controls.start(path02Variants.open)
					} else {
						path01Controls.start(path01Variants.closed)
						await path02Controls.start(path02Variants.moving)
						path02Controls.start(path02Variants.closed)
					}
				}}
			>
				<svg width="24" height="24" viewBox="0 0 24 24">
					<motion.path
						{...path01Variants.closed}
						animate={path01Controls}
						transition={{ duration: 0.2 }}
						stroke="currentColor"
						strokeWidth={1.5}
					/>
					<motion.path
						{...path02Variants.closed}
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
					className="absolute right-5 whitespace-nowrap font-mono text-sm uppercase"
				>
					<Link to="/">{title}</Link>
				</motion.p>
			)}
		</div>
	)
}
