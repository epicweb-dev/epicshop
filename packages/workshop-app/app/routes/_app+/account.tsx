import { deleteCache } from '@kentcdodds/workshop-utils/cache.server'
import {
	deleteDb,
	deleteDiscordInfo,
	requireAuthInfo,
	setPresencePreferences,
} from '@kentcdodds/workshop-utils/db.server'
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, useFetcher, useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import { useOptionalDiscordMember, useUser } from '#app/components/user.tsx'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { usePresencePreferences } from '#app/utils/presence.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { getDiscordAuthURL } from '../discord.callback.ts'

export async function loader({ request }: LoaderFunctionArgs) {
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
		return redirectWithToast('/account', {
			type: 'success',
			title: 'Disconnected',
			description: 'Local discord data has been deleted.',
		})
	} else if (intent === 'logout') {
		await deleteDb()
		await deleteCache()
		return redirectWithToast('/login', {
			type: 'success',
			title: 'Logged out',
			description: 'Goodbye! Come back soon!',
		})
	} else if (intent === 'presence-opt-out') {
		const optOut = formData.get('optOut') === 'true'
		await setPresencePreferences({ optOut })
		return redirectWithToast('/account', {
			title: optOut ? 'Opted out' : 'Opted in',
			description: `You are now ${optOut ? 'invisible' : 'visible'}.`,
			type: 'success',
		})
	}

	return redirect('/account')
}

export default function Account() {
	const data = useLoaderData<typeof loader>()
	const disconnectFetcher = useFetcher()
	const user = useUser()
	const discordMember = useOptionalDiscordMember()
	const presencePreferences = usePresencePreferences()
	return (
		<main className="container flex h-full w-full max-w-3xl flex-grow flex-col items-center justify-center gap-4">
			<img
				className="h-36 w-36 rounded-full"
				alt={discordMember?.displayName ?? user.name ?? user.email}
				src={user.avatarUrl}
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
					<Icon name="Discord" size="lg" />
					Connect Discord
				</Link>
			)}
			<Form method="POST">
				<input
					name="optOut"
					type="hidden"
					value={presencePreferences?.optOut ? 'false' : 'true'}
				/>
				<Button varient="mono" name="intent" value="presence-opt-out">
					{presencePreferences?.optOut ? 'Opt in to' : 'Opt out of'} presence
				</Button>
			</Form>
			<p>
				<small>
					Note: it is your <i className="italic">device</i> that's logged in,
					not your browser. So all browsers on this device will be logged in
					with the same account on this device.
				</small>
			</p>
			<Form method="post" className="mt-2">
				<Button varient="primary" name="intent" value="logout">
					Log out
				</Button>
			</Form>
			<p>
				Check{' '}
				<Link to="/onboarding" className="underline">
					/onboarding
				</Link>{' '}
				if you'd like to review onboarding again.
			</p>
			<p>
				Check{' '}
				<Link to="/support" className="underline">
					/support
				</Link>{' '}
				if you need support.
			</p>
		</main>
	)
}
