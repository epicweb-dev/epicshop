import { json, redirect, type DataFunctionArgs } from '@remix-run/node'
import { Form } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import { useUser } from '#app/components/user.tsx'
import { deleteAuthInfo, requireAuthInfo } from '#app/utils/db.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { deleteCache } from '#utils/cache.server.ts'

export async function loader({ request }: DataFunctionArgs) {
	ensureUndeployed()
	await requireAuthInfo({ request })
	return json({})
}

export async function action() {
	ensureUndeployed()
	await deleteAuthInfo()
	await deleteCache()
	return redirect('/login')
}

export default function Account() {
	const user = useUser()
	return (
		<main className="container flex w-full max-w-lg flex-grow flex-col items-center justify-center gap-4">
			<img
				className="h-36 w-36 rounded-full"
				alt={user.name ?? user.email}
				src={user.gravatarUrl}
			/>
			<h1 className="mb-1 text-2xl">Your Account</h1>
			<p className="text-center text-gray-700 dark:text-gray-300">
				{user.name
					? `Hi ${user.name}, your device is logged in with ${user.email}.`
					: `Your device is logged in with ${user.email}.`}
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
