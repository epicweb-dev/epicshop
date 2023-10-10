import { json, redirect, type DataFunctionArgs } from '@remix-run/node'
import { Form, Link, useFetcher, useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { useOptionalDiscordMember, useUser } from '#app/components/user.tsx'
import {
	deleteDb,
	deleteDiscordInfo,
	requireAuthInfo,
} from '#app/utils/db.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { deleteCache } from '#utils/cache.server.ts'
import { getDiscordAuthURL } from '../discord.callback.ts'

export async function loader({ request }: DataFunctionArgs) {
	ensureUndeployed()
	await requireAuthInfo({ request })
	return json({ discordAuthUrl: getDiscordAuthURL() })
}

export async function action({ request }: { request: Request }) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	if (intent === 'disconnect-discord') {
		await deleteDiscordInfo()
	} else if (intent === 'logout') {
		await deleteDb()
		await deleteCache()
	}

	return redirect('/login')
}

export default function Account() {
	const data = useLoaderData<typeof loader>()
	const disconnectFetcher = useFetcher()
	const user = useUser()
	const discordMember = useOptionalDiscordMember()
	return (
		<main className="container flex h-full w-full max-w-lg flex-grow flex-col items-center justify-center gap-4">
			<img
				className="h-36 w-36 rounded-full"
				alt={discordMember?.displayName ?? user.name ?? user.email}
				src={discordMember?.avatarURL ?? user.gravatarUrl}
			/>
			<h1 className="mb-1 text-2xl">Your Account</h1>
			<p className="text-center text-gray-700 dark:text-gray-300">
				{user.name
					? `Hi ${
							discordMember?.displayName ?? user.name
					  }, your device is logged in with ${user.email}.`
					: `Your device is logged in with ${user.email}.`}
			</p>
			{discordMember ? (
				<>
					<p className="text-center text-gray-700 dark:text-gray-300">
						And you are connected to discord as {discordMember.displayName} (
						{discordMember.id}).
					</p>
					<disconnectFetcher.Form method="post" className="mt-2">
						<Button varient="mono" name="intent" value="disconnect-discord">
							Disconnect Discord
						</Button>
					</disconnectFetcher.Form>
				</>
			) : (
				<Link
					to={data.discordAuthUrl}
					className="inline-flex items-center gap-2 underline"
				>
					<Icon name="Discord" size={24} />
					Connect Discord
				</Link>
			)}
			<p>
				<small>
					Note: it is your <i className="italic">device</i> that's logged in,
					not your browser. So all browsers on this device will be logged in
					with the same account.
				</small>
			</p>
			<Form method="post" className="mt-2">
				<Button varient="primary" name="intent" value="logout">
					Log out
				</Button>
			</Form>
		</main>
	)
}
