import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { getExamples, getSteps, getWorkshopTitle } from '~/utils/misc.server'
import { isAppRunning } from '~/utils/process-manager.server'

export async function loader() {
	return json({
		title: await getWorkshopTitle(),
		steps: (await getSteps()).map(s => ({
			stepNumber: s.stepNumber,
			title: s.title,
			exercise: s.exercise
				? {
						relativePath: s.exercise.relativePath,
						port: s.exercise.portNumber,
						isRunning: isAppRunning(s.exercise),
				  }
				: null,
			final: s.final
				? {
						relativePath: s.final.relativePath,
						port: s.final.portNumber,
						isRunning: isAppRunning(s.final),
				  }
				: null,
		})),
		examples: (await getExamples()).map(e => ({
			title: e.title,
			path: e.relativePath,
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
					<p>Here are your steps:</p>
					<ul>
						{data.steps.map(step => (
							<li key={step.stepNumber}>
								<div className="flex">
									<Link to={`exercise/${step.stepNumber}`}>
										{step.stepNumber}. {step.title}
									</Link>
									{step.exercise ? (
										step.exercise.isRunning ? (
											<a href={`http://localhost:${step.exercise.port}`}>
												Open Exercise
											</a>
										) : (
											<Link
												to={`/start?relativePath=${encodeURIComponent(
													step.exercise.relativePath,
												)}`}
											>
												Start Exercise
											</Link>
										)
									) : (
										<span>(no exercise)</span>
									)}
									{step.final ? (
										step.final.isRunning ? (
											<a href={`http://localhost:${step.final.port}`}>
												Open Final
											</a>
										) : (
											<Link
												to={`/start?relativePath=${encodeURIComponent(
													step.final.relativePath,
												)}`}
											>
												Start Exercise
											</Link>
										)
									) : (
										<span>(no final)</span>
									)}
								</div>
							</li>
						))}
					</ul>
				</div>
			</div>
		</main>
	)
}
