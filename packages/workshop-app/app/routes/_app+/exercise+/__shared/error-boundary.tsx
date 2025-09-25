import { href, Link, type ErrorResponse } from 'react-router'
import z from 'zod'

export const error404Schema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('step-not-found'),
		steps: z.array(
			z.object({
				stepNumber: z.number(),
				title: z.string(),
				hasProblem: z.boolean(),
				hasSolution: z.boolean(),
			}),
		),
		exerciseNumber: z.number(),
		exerciseTitle: z.string(),
	}),
	z.object({
		type: z.literal('exercise-not-found'),
		exercises: z.array(
			z.object({
				title: z.string(),
				number: z.number(),
			}),
		),
	}),
])

export function Exercise404ErrorBoundary({
	error,
	params,
}: {
	error: ErrorResponse
	params: Record<string, string | undefined>
}) {
	console.log(error)
	const validationResult = error404Schema.safeParse(error.data)
	const label = [params.exerciseNumber, params.stepNumber, params.type]
		.filter(Boolean)
		.join('.')

	if (!validationResult.success) {
		console.error(
			'Invalid 404 error response data',
			validationResult.error,
			error,
		)
		return <p className="text-2xl font-bold">"{label}" not found</p>
	}
	const { data } = validationResult
	if (data.type === 'step-not-found') {
		const { steps, exerciseNumber } = data

		return (
			<div className="prose">
				<p className="text-2xl font-bold">Step not found for "{label}"</p>
				{steps.length > 0 ? (
					<div className="text-lg">
						<p id="available-steps-heading">Available Steps:</p>
						<ul
							className="m-0 list-inside list-none pl-4"
							aria-labelledby="available-steps-heading"
						>
							{steps.map((step) => (
								<li key={step.stepNumber} className="mb-2">
									<span className="font-medium">
										{step.stepNumber}. {step.title}
									</span>
									<div className="ml-4 flex gap-4">
										{step.hasProblem ? (
											<Link
												to={href(
													'/exercise/:exerciseNumber/:stepNumber/:type',
													{
														exerciseNumber: String(exerciseNumber).padStart(
															2,
															'0',
														),
														stepNumber: String(step.stepNumber).padStart(
															2,
															'0',
														),
														type: 'problem',
													},
												)}
											>
												💪 Problem
											</Link>
										) : null}
										{step.hasSolution ? (
											<Link
												to={href(
													'/exercise/:exerciseNumber/:stepNumber/:type',
													{
														exerciseNumber: String(exerciseNumber).padStart(
															2,
															'0',
														),
														stepNumber: String(step.stepNumber).padStart(
															2,
															'0',
														),
														type: 'solution',
													},
												)}
											>
												🏁 Solution
											</Link>
										) : null}
									</div>
								</li>
							))}
						</ul>
					</div>
				) : (
					<p>
						No steps are available for this exercise.{' '}
						<Link
							to={href('/exercise/:exerciseNumber', {
								exerciseNumber: String(exerciseNumber).padStart(2, '0'),
							})}
						>
							View Exercise
						</Link>
					</p>
				)}
			</div>
		)
	} else if (data.type === 'exercise-not-found') {
		const { exercises } = data
		return (
			<div className="prose">
				<p className="text-2xl font-bold">Exercise not found for "{label}"</p>
				<div className="text-lg">
					<p id="available-exercises-heading">Available Exercises:</p>
					<ul
						className="m-0 list-inside list-none pl-4"
						aria-labelledby="available-exercises-heading"
					>
						{exercises.map((exercise) => (
							<li key={exercise.number}>
								<Link
									to={href('/exercise/:exerciseNumber', {
										exerciseNumber: String(exercise.number).padStart(2, '0'),
									})}
								>
									{exercise.number}. {exercise.title}
								</Link>
							</li>
						))}
					</ul>
				</div>
			</div>
		)
	} else {
		throw new Error(`Unknown error type: ${(data as any).type}`)
	}
}
