import type { DataFunctionArgs } from '@remix-run/node'
import { redirect, defer } from '@remix-run/node'
import { Await, useLoaderData } from '@remix-run/react'
import { Suspense, useEffect } from 'react'
import invariant from 'tiny-invariant'
import {
	exec,
	getAppFromRelativePath,
	getWorkshopRoot,
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
			return `http://localhost:${app.portNumber}`
		}),
	})
}

export default function StartWaiter() {
	console.log('start waiter')
	const data = useLoaderData<typeof loader>()

	useEffect(() => {
		let current = true
		data.appReady.then(address => {
			if (current) {
				console.log('redirecting', address)
				window.location.replace(address)
			}
		})
		return () => {
			current = false
		}
	}, [data.appReady])

	return (
		<div>
			<Suspense
				fallback={
					<h1>
						Starting {data.title} on port {data.port}...
					</h1>
				}
			>
				<Await resolve={data.appReady}>
					{() => <h1>Ready! Redirecting...</h1>}
				</Await>
			</Suspense>
			<Suspense fallback={<h1>Opening VS Code...</h1>}>
				<Await resolve={data.vsCodeReady}>
					{() => <h1>VS Code ready!</h1>}
				</Await>
			</Suspense>
		</div>
	)
}
