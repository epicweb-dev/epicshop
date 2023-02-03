import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import { getErrorMessage } from '~/utils/misc'
import {
	getAppByName,
	getApps,
	getDiff,
	getNextApp,
	requireTopicApp,
} from '~/utils/misc.server'

export async function loader({ request, params }: DataFunctionArgs) {
	const searchParams = new URL(request.url).searchParams
	const app = await requireTopicApp(params)
	const compareName = searchParams.get('compare')
	const compareApp = compareName
		? await getAppByName(compareName)
		: await getNextApp(app)
	if (!compareApp) {
		throw new Response('No app to compare to', { status: 404 })
	}
	const diffHtml = await getDiff(app, compareApp)
	const allApps = (await getApps()).map(a => ({
		name: a.name,
		title: a.title,
	}))

	return json({
		allApps,
		app: app.name,
		compareApp: compareApp.name,
		diffHtml,
		// diff
	})
}

export default function Diff() {
	const data = useLoaderData<typeof loader>()
	return (
		<div>
			<pre
				className="whitespace-pre-wrap"
				dangerouslySetInnerHTML={{ __html: data.diffHtml }}
			/>
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
