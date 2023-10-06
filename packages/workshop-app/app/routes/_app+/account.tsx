import { json, type DataFunctionArgs, redirect } from '@remix-run/node'
import { Form, useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import {
	deleteAuthInfo,
	getUserAvatar,
	requireAuthInfo,
} from '#app/utils/db.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader({ request }: DataFunctionArgs) {
	ensureUndeployed()
	const { email, name } = await requireAuthInfo({ request })
	const gravatarUrl = await getUserAvatar({ email, size: 288 })
	return json({ email, name, gravatarUrl })
}

export async function action() {
	ensureUndeployed()
	await deleteAuthInfo()
	return redirect('/login')
}

export default function Account() {
	const data = useLoaderData<typeof loader>()
	return (
		<main className="container flex w-full max-w-lg flex-grow flex-col items-center justify-center gap-4">
			<img
				className="h-36 w-36 rounded-full"
				alt={data.name ?? data.email}
				src={data.gravatarUrl}
			/>
			<h1 className="mb-1 text-2xl">Your Account</h1>
			<p className="text-center text-gray-700 dark:text-gray-300">
				{data.name
					? `Hi ${data.name}, your device is logged in with ${data.email}.`
					: `Your device is logged in with ${data.email}.`}
			</p>
			<p>
				<small>
					Note: it is your <i className="italic">device</i> that's logged in,
					not your browser. So all browsers on this device will be logged in
					with the same account.
				</small>
			</p>
			<Form method="post" className="mt-2">
				<Button varient="primary">Log out</Button>
			</Form>
		</main>
	)
}
