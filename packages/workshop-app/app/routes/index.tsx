import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import {
	getExampleApps,
	getExercises,
	getWorkshopTitle,
} from '~/utils/misc.server'
import { isAppRunning } from '~/utils/process-manager.server'

export async function loader() {
	return json({
		title: await getWorkshopTitle(),
		exercises: (await getExercises()).map(e => ({
			exerciseNumber: e.exerciseNumber,
			title: e.title,
		})),
		examples: (await getExampleApps()).map(e => ({
			name: e.name,
			title: e.title,
			isRunning: isAppRunning(e),
		})),
	})
}

export default function Index() {
	const data = useLoaderData<typeof loader>()
	return (
		<main className="relative min-h-screen bg-white sm:flex sm:items-center sm:justify-center">
			<div>
				<h1></h1>
				<div>
					<p>Here are your exercises:</p>
					<ul>
						{data.exercises.map(exercise => (
							<li key={exercise.exerciseNumber}>
								<div className="flex">
									<Link
										to={`${exercise.exerciseNumber}`}
										className="text-blue-800 underline"
									>
										{exercise.exerciseNumber}. {exercise.title}
									</Link>
								</div>
							</li>
						))}
					</ul>
				</div>
			</div>
		</main>
	)
}
