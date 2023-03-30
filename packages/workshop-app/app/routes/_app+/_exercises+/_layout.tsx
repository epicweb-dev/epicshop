import type { DataFunctionArgs, HeadersFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useParams } from '@remix-run/react'
import clsx from 'clsx'
import type { AnimationControls } from 'framer-motion'
import { motion, useAnimationControls } from 'framer-motion'
import React from 'react'
import invariant from 'tiny-invariant'
import { getExercises, getWorkshopTitle } from '~/utils/apps.server'
import {
	makeTimings,
	combineServerTimings,
	getServerTimeHeader,
} from '~/utils/timing.server'

export async function loader({ request, params }: DataFunctionArgs) {
	const timings = makeTimings('stepLoader')
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const [exercises, workshopTitle] = await Promise.all([
		getExercises({ request, timings }),
		getWorkshopTitle(),
	])
	const exercise = exercises.find(
		e => e.exerciseNumber === Number(params.exerciseNumber),
	)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}

	const result = json(
		{
			workshopTitle,
			exerciseNumber: exercise.exerciseNumber,
			exerciseTitle: exercise.title,
			exercises: exercises.map(e => ({
				exerciseNumber: e.exerciseNumber,
				title: e.title,
				problems: e.problems.map(({ stepNumber, title }) => ({
					stepNumber,
					title,
				})),
			})),
		},
		{
			headers: {
				'Cache-Control': 'public, max-age=300',
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
	return result
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function ExercisesLayout() {
	return (
		<div className="flex flex-grow">
			<Navigation />
			<div className="flex flex-grow">
				<Outlet />
			</div>
		</div>
	)
}

function Navigation() {
	const { workshopTitle, exerciseNumber, exerciseTitle, exercises } =
		useLoaderData<typeof loader>()
	const params = useParams()

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
				duration: 0.1,
				when: 'beforeChildren',
				staggerChildren: 0.1,
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

	return (
		// eslint-disable-next-line jsx-a11y/role-supports-aria-props
		<nav
			className="flex items-center border-r border-gray-200 bg-white"
			aria-expanded={isMenuOpened}
		>
			<motion.div
				initial={isMenuOpened ? 'open' : 'close'}
				variants={menuVariants}
				animate={menuControls}
			>
				<ul className="flex h-screen flex-col items-center justify-between">
					<NavToggle
						title={workshopTitle}
						menuControls={menuControls}
						isMenuOpened={isMenuOpened}
						setMenuOpened={setMenuOpened}
					/>
					{isMenuOpened && (
						<>
							<motion.li
								style={{ width: OPENED_MENU_WIDTH }}
								className="scrollbar-thin scrollbar-thumb-gray-200 flex h-full flex-grow flex-col justify-start overflow-y-auto p-6"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
							>
								<motion.ul
									variants={listVariants}
									initial="hidden"
									animate="visible"
									className="flex flex-col gap-3"
								>
									{exercises.map(({ exerciseNumber, title, problems }) => {
										const isActive =
											Number(params.exerciseNumber) === exerciseNumber
										const exerciseNum = exerciseNumber
											.toString()
											.padStart(2, '0')
										return (
											<motion.li variants={itemVariants} key={exerciseNumber}>
												<Link
													to={`/${exerciseNum}`}
													className={clsx(
														'relative whitespace-nowrap px-2 py-0.5 pr-3 text-2xl font-bold outline-none hover:underline focus:underline',
														{
															'bg-black text-white after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-white after:content-[""]':
																isActive,
														},
													)}
												>
													{title}
												</Link>
												{isActive && (
													<motion.ul
														variants={listVariants}
														initial="hidden"
														animate="visible"
														className="ml-4 mt-4 flex flex-col gap-3"
													>
														{problems.map(({ stepNumber, title }) => {
															const isActive =
																Number(params.stepNumber) === stepNumber
															const step = stepNumber
																.toString()
																.padStart(2, '0')
															return (
																<motion.li
																	variants={itemVariants}
																	key={stepNumber}
																>
																	<Link
																		to={`/${exerciseNum}/${step}`}
																		className={clsx(
																			'relative whitespace-nowrap px-2 py-0.5 pr-3 text-xl font-medium outline-none after:absolute after:-right-2.5 after:-bottom-2.5 after:h-5 after:w-5 after:rotate-45 after:scale-75 after:bg-white after:content-[""] hover:underline focus:underline',
																			{ 'bg-black text-white': isActive },
																		)}
																	>
																		{step}. {title}
																	</Link>
																</motion.li>
															)
														})}
													</motion.ul>
												)}
											</motion.li>
										)
									})}
								</motion.ul>
							</motion.li>
						</>
					)}
					{!isMenuOpened && (
						<motion.li className="flex h-full flex-grow flex-col justify-center">
							<Link
								className="orientation-sideways w-full font-mono text-sm font-medium uppercase leading-none"
								to={`/${exerciseNumber.toString().padStart(2, '0')}`}
							>
								{exerciseTitle}
								{params.type === 'solution'
									? ' — solution'
									: params.type === 'problem'
									? ' — problem'
									: null}
							</Link>
						</motion.li>
					)}
				</ul>
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
		<div className="relative flex w-full items-center justify-between overflow-hidden border-b border-gray-200">
			<button
				className="flex h-14 w-14 items-center justify-center"
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
