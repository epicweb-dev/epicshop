import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { getApps, getNextApp, requireTopicApp } from '~/utils/misc.server'

export async function loader({ request, params }: DataFunctionArgs) {
	// const searchParams = new URL(request.url).searchParams
	// const app = await requireTopicApp(params)
	// const compareApp = searchParams.get('compare') ?? await getNextApp(app)
	// const diff = await getDiff(app, compareApp)
	const allApps = (await getApps()).map(a => ({
		name: a.name,
		title: a.title,
	}))

	return json({
		allApps,
		// diff
	})
}

export default function Diff() {
	return <div>DIFF!</div>
}
