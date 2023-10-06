import { json, type DataFunctionArgs, redirect } from '@remix-run/node'
import { Form } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import { deleteAuthInfo, requireAuthInfo } from '#app/utils/db.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
export async function loader({ request }: DataFunctionArgs) {
	ensureUndeployed()
	await requireAuthInfo({ request })
	return json({})
}

export async function action() {
	ensureUndeployed()
	await deleteAuthInfo()
	return redirect('/login')
}

export default function Account() {
	return (
		<main className="flex w-full flex-grow flex-col items-center justify-center">
			<h1 className="text-2xl">Your Account</h1>
			<p className="pb-8 pt-3 text-gray-700 dark:text-gray-300">
				You are logged in.
			</p>
			<Form method="post">
				<Button varient="primary">Log out</Button>
			</Form>
		</main>
	)
}
