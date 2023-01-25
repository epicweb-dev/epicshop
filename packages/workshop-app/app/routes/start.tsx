import type { DataFunctionArgs } from '@remix-run/node'
import { redirect, defer } from '@remix-run/node'
import {
	Await,
	useAsyncError,
	useLoaderData,
	useNavigate,
} from '@remix-run/react'
import { Suspense, useEffect } from 'react'
import invariant from 'tiny-invariant'
import { getErrorMessage } from '~/utils/misc'
import {
	exec,
	getAppFromRelativePath,
	getWorkshopRoot,
	isExercisePartApp,
} from '~/utils/misc.server'
import { runAppDev, waitOnApp } from '~/utils/process-manager.server'

export async function loader({ request }: DataFunctionArgs) {
	const relativePath = new URL(request.url).searchParams.get('relativePath')
	invariant(typeof relativePath === 'string', 'relativePath is required')
	if (relativePath.includes('..')) {
		throw redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
	}
	const app = await getAppFromRelativePath(relativePath)
	if (!app) {
		throw new Response('Not found', { status: 404 })
	}

	await runAppDev(app)

	return defer({
		title: app.title,
		port: app.portNumber,
		vsCodeReady: exec(
			`code "${await getWorkshopRoot()}" "${app.fullPath}/README.md"`,
		),
		appReady: waitOnApp(app).then(() => {
			if (isExercisePartApp(app)) {
				return `/exercise/${app.exerciseNumber}`
			} else {
				return `/example/${app.name}`
			}
		}),
	})
}

export default function StartWaiter() {
	const data = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	useEffect(() => {
		let current = true
		data.appReady.then(pathname => {
			if (current) {
				navigate(pathname)
			}
		})
		return () => {
			current = false
		}
	}, [data.appReady, navigate])

	return (
		<div>
			<Suspense
				fallback={
					<h1>
						Starting {data.title} on port {data.port}...
					</h1>
				}
			>
				<Await resolve={data.appReady} errorElement={<ErrorFallback />}>
					{() => <h1>Ready! Redirecting...</h1>}
				</Await>
			</Suspense>
			<Suspense fallback={<h1>Opening VS Code...</h1>}>
				<Await resolve={data.vsCodeReady} errorElement={<ErrorFallback />}>
					{() => <h1>VS Code ready!</h1>}
				</Await>
			</Suspense>
		</div>
	)
}

function ErrorFallback() {
	const error = useAsyncError()

	return (
		<div>
			<div>
				Whoops! Sorry, there was an error{' '}
				<span role="img" aria-label="grimace">
					😬
				</span>
			</div>
			<hr className="my-2" />
			<pre className="whitespace-pre-wrap">{getErrorMessage(error)}</pre>
		</div>
	)
}
