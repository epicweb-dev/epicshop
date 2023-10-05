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
		<main>
			<h1 className="text-2xl">Account</h1>
			<p>You are logged in</p>
			<Form method="post">
				<Button varient="primary">Logout</Button>
			</Form>
		</main>
	)
}
