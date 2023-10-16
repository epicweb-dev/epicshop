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
import { ToastHub } from '#app/components/toast.tsx'
import {
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

import { usePresence } from './presence.ts'

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

function FacePile({ isMenuOpened }: { isMenuOpened: boolean }) {
	const user = useOptionalUser()
	const { users } = usePresence(user)
	const limit = isMenuOpened ? 17 : 0
	const numberOverLimit = users.length - limit
	return (
		<div
			className={cn(
				'flex w-full items-center justify-start border-t p-4 transition-[height]',
				isMenuOpened && users.length > 4 ? 'h-28' : 'h-14',
			)}
			style={isMenuOpened ? { width: OPENED_MENU_WIDTH } : {}}
		>
			<div className="flex flex-wrap items-center gap-2">
				<TooltipProvider>
					{users.slice(0, limit).map(user => (
						<Tooltip key={user.id}>
							<TooltipTrigger asChild>
								<img
									alt={user.name || 'Epic Web Dev'}
									className="h-8 w-8 rounded-full border object-cover"
									src={user.avatarUrl}
								/>
							</TooltipTrigger>
							<TooltipContent>{user.name || 'Epic Web Dev'}</TooltipContent>
						</Tooltip>
					))}
					{numberOverLimit > 0 ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<div
									className={cn(
										'flex items-center justify-center text-ellipsis rounded-full border-2 border-gray-200 bg-gray-200 text-sm text-gray-800',
										isMenuOpened ? 'h-8 w-8' : 'h-6 w-6',
									)}
								>
									+{numberOverLimit > 10 ? '...' : numberOverLimit}
								</div>
							</TooltipTrigger>
							<TooltipContent>Epic Web Devs working now</TooltipContent>
						</Tooltip>
					) : null}
				</TooltipProvider>
			</div>
		</div>
	)
}

export default function App() {
	const user = useOptionalUser()

	const [isMenuOpened, setMenuOpened] = React.useState(false)

	return (
		<div className="flex flex-col">
			{user ? null : <EpicWebBanner />}
			<div
				className={cn('flex flex-grow', {
					'h-[calc(100vh-112px)] sm:h-[calc(100vh-64px)]': ENV.KCDSHOP_DEPLOYED,
					'h-[calc(100vh-64px)]': !user,
					'h-screen': user,
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
				<ToastHub />
			</div>
		</div>
	)
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

	const exercise = data.exercises.find(
		e => e.exerciseNumber === Number(params.exerciseNumber),
	)
	const app =
		params.type === 'solution'
			? exercise?.solutions.find(
					s => s.stepNumber === Number(params.stepNumber),
			  )
			: params.type === 'problem'
			? exercise?.problems.find(p => p.stepNumber === Number(params.stepNumber))
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
					<FacePile isMenuOpened={isMenuOpened} />
					{ENV.KCDSHOP_DEPLOYED ? null : user ? (
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
					) : null}
					{ENV.KCDSHOP_DEPLOYED ? null : user && nextExerciseRoute ? (
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
