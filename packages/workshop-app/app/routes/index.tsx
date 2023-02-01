import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { getExamples, getTopics, getWorkshopTitle } from '~/utils/misc.server'
import { isAppRunning } from '~/utils/process-manager.server'

export async function loader() {
	return json({
		title: await getWorkshopTitle(),
		steps: (await getTopics()).map(s => ({
			stepNumber: s.topicNumber,
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
									<Link
										to={`exercise/${step.stepNumber}`}
										className="text-blue-800 underline"
									>
										{step.stepNumber}. {step.title}
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
