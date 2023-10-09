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
import { useOptionalUser } from '#app/components/user.tsx'
import {
	extractNumbersFromAppName,
	getExercises,
	getPlaygroundAppName,
	getWorkshopTitle,
} from '#app/utils/apps.server.ts'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '#app/utils/timing.server.ts'
import { useNextExerciseRoute } from '../progress.tsx'
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

export default function App() {
	const user = useOptionalUser()

	return (
		<div className="flex flex-col">
			{ENV.KCDSHOP_DEPLOYED || user ? null : <EpicWebBanner />}
			<div
				className={clsx('flex flex-grow', {
					'h-[calc(100vh-56px)]': !user,
					'h-screen': user,
				})}
			>
				<Navigation />
				<Outlet />
				<ToastHub />
			</div>
		</div>
	)
}

function EpicWebBanner() {
	return (
		<div className="z-10 flex h-14 items-center justify-between border-b bg-gradient-to-tr from-blue-500 to-indigo-500 pl-4 text-white">
			<div className="flex items-center gap-4">
				<Icon name="EpicWeb" size={24} />
				<p>
					Welcome to the Workshop App for{' '}
					<Link
						to="https://www.epicweb.dev"
						className="underline"
						target="_blank"
					>
						EpicWeb.dev
					</Link>
					!
				</p>
			</div>
			<div className="flex h-full items-center">
				<Link
					to="https://www.epicweb.dev"
					target="_blank"
					className="flex h-full items-center justify-center space-x-1.5 px-5 text-sm font-semibold"
				>
					<span className="drop-shadow-sm">Buy Epic Web</span>
					<span>↗︎</span>
				</Link>
				<Link
					to="/login"
					className="flex h-full items-center justify-center space-x-1.5 bg-white/20 px-5 text-sm font-semibold shadow-md transition hover:bg-white/30"
				>
					<Icon name="User" size={24} />
					<span className="drop-shadow-sm">Restore Purchase</span>
				</Link>
			</div>
		</div>
	)
}

function Navigation() {
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

	const OPENED_MENU_WIDTH = 400

	// container
	const [isMenuOpened, setMenuOpened] = React.useState(false)
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
	const itemVariants = {
		hidden: { opacity: 0, x: -20 },
		visible: { opacity: 1, x: 0 },
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
								className="flex flex-col gap-3"
							>
								{data.exercises.map(({ exerciseNumber, title, steps }) => {
									const isActive =
										Number(params.exerciseNumber) === exerciseNumber
									const showPlayground =
										!isActive &&
										data.playground.exerciseNumber === exerciseNumber
									const exerciseNum = exerciseNumber.toString().padStart(2, '0')
									return (
										<motion.li variants={itemVariants} key={exerciseNumber}>
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
													className="ml-4 mt-4 flex flex-col gap-3"
												>
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
																<motion.li
																	variants={itemVariants}
																	key={stepNumber}
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
																</motion.li>
															)
														})}
													<motion.li variants={itemVariants}>
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
													</motion.li>
												</motion.ul>
											)}
										</motion.li>
									)
								})}
							</motion.ul>
							<div>
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
					{ENV.KCDSHOP_DEPLOYED ? null : user ? (
						<Link
							className="flex h-14 w-full items-center justify-start space-x-3 border-t px-4 py-4 text-center no-underline hover:underline"
							to="/account"
						>
							{user.gravatarUrl ? (
								<img
									alt={user.name ?? user.email}
									src={user.gravatarUrl}
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
							) : null}
						</Link>
					) : null}
					{ENV.KCDSHOP_DEPLOYED ? null : user && nextExerciseRoute ? (
						<Link
							to={nextExerciseRoute}
							prefetch="intent"
							className={clsx(
								'flex h-14 w-full items-center space-x-3 border-t px-4 py-4 pl-[18px] no-underline hover:underline',
							)}
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
							) : null}
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
