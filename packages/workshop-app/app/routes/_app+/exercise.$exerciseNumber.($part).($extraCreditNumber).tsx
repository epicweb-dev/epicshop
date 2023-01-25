import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import { getErrorMessage } from '~/utils/misc'
import {
	getApps,
	isExerciseApp,
	isExtraCreditExerciseApp,
	isExtraCreditFinalApp,
	isFinalApp,
} from '~/utils/misc.server'
import { isPortAvailable, isAppRunning } from '~/utils/process-manager.server'
import { AppStarter, AppStopper, PortStopper } from '../start'

export async function loader({ params }: DataFunctionArgs) {
	const { exerciseNumber, part = 'exercise', extraCreditNumber = '0' } = params
	if (part !== 'exercise' && part !== 'final') {
		throw new Response('Not found', { status: 404 })
	}

	const ec = Number(extraCreditNumber)
	const en = Number(exerciseNumber)

	const isEC = ec > 0

	const apps = await getApps()
	const app = apps.find(app => {
		if (part === 'exercise') {
			if (isEC) {
				if (isExtraCreditExerciseApp(app)) {
					return app.exerciseNumber === en && app.extraCreditNumber === ec
				}
			} else if (isExerciseApp(app)) {
				return app.exerciseNumber === en
			}
		}
		if (part === 'final') {
			if (isEC) {
				if (isExtraCreditFinalApp(app)) {
					return app.exerciseNumber === en && app.extraCreditNumber === ec
				}
			} else if (isFinalApp(app)) {
				return app.exerciseNumber === en
			}
		}
		return false
	})
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}

	const isRunning = isAppRunning(app)
	return json({
		isRunning,
		isPortAvailable: isRunning ? null : await isPortAvailable(app.portNumber),
		title: app.title,
		port: app.portNumber,
		relativePath: app.relativePath,
	})
}

export default function ExercisePartRoute() {
	const data = useLoaderData<typeof loader>()

	return data.isRunning ? (
		<div>
			<AppStopper relativePath={data.relativePath} />
			<iframe
				title={data.title}
				src={`http://localhost:${data.port}`}
				className="h-full w-full"
			/>
		</div>
	) : data.isPortAvailable === false ? (
		<div>
			<div>
				The port for this app is unavailable. It could be that you're running it
				elsewhere?
			</div>
			<PortStopper port={data.port} />
		</div>
	) : (
		<AppStarter relativePath={data.relativePath} />
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find an exercise here.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
