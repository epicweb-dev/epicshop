import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import { getDiffCode } from '~/utils/diff.server'
import { Mdx } from '~/utils/mdx'
import { getErrorMessage } from '~/utils/misc'
import { getAppByName, getApps, getExerciseApp } from '~/utils/misc.server'

export async function loader({ request, params }: DataFunctionArgs) {
	const searchParams = new URL(request.url).searchParams
	const app1Name = searchParams.get('app1')
	const app2Name = searchParams.get('app2')
	const app1 = app1Name
		? await getAppByName(app1Name)
		: await getExerciseApp({ ...params, type: 'problem' })
	const app2 = app2Name
		? await getAppByName(app2Name)
		: await getExerciseApp({ ...params, type: 'solution' })

	if (!app1 || !app2) {
		throw new Response('No app to compare to', { status: 404 })
	}

	const allApps = (await getApps()).map(a => ({
		name: a.name,
		title: a.title,
	}))

	return json({
		allApps,
		app1: app1.name,
		app2: app2.name,
		diffCode: await getDiffCode(app1, app2),
	})
}

export default function Diff() {
	const data = useLoaderData<typeof loader>()
	return (
		<div>
			<div className="prose whitespace-pre-wrap">
				<Mdx code={data.diffCode} />
			</div>
			<pre>{JSON.stringify(data, null, 2)}</pre>
		</div>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find an app to compare to.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
