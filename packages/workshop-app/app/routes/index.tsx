import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import {
	getExampleApps,
	getExercises,
	getWorkshopTitle,
} from '~/utils/apps.server'
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
				<h1 className="mb-7 text-4xl font-bold">{data.title}</h1>
				<div>
					<ul className="flex flex-col gap-2">
						{data.exercises.map(exercise => (
							<li key={exercise.exerciseNumber}>
								<Link
									to={`${exercise.exerciseNumber.toString().padStart(2, '0')}`}
									className="clip-path-button mr-auto inline-flex min-w-fit max-w-xs border-2 border-black bg-black px-8 py-4 font-bold text-white outline-none hover:bg-white hover:text-black focus:bg-white focus:text-black"
								>
									<div className="flex flex-wrap">
										{exercise.exerciseNumber}. {exercise.title}
									</div>
								</Link>
							</li>
						))}
					</ul>
				</div>
			</div>
		</main>
	)
}
