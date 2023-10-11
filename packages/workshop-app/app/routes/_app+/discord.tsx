import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Icon } from '#app/components/icons.tsx'
import {
	useOptionalDiscordMember,
	useOptionalUser,
} from '#app/components/user.tsx'

import { getDiscordAuthURL } from '../discord.callback.ts'

export async function loader() {
	return json({ discordAuthUrl: getDiscordAuthURL() })
}

export function useDiscordCTALink({
	discordAuthUrl,
}: {
	discordAuthUrl: string
}) {
	const user = useOptionalUser()
	const discordMember = useOptionalDiscordMember()

	if (!user) {
		return '/login'
	}
	if (user && !discordMember) {
		return discordAuthUrl
	}
	if (user && discordMember) {
		return 'https://discord.com/channels/715220730605731931/1161045224907341972'
	}

	return 'https://kentcdodds.com/discord'
}

export function DiscordCTA({ discordAuthUrl }: { discordAuthUrl: string }) {
	const user = useOptionalUser()
	const discordMember = useOptionalDiscordMember()

	if (!user) {
		return (
			<div className="flex flex-wrap items-center justify-center gap-2 text-xl">
				<Link to="/login" className="inline-flex items-center gap-2 underline">
					<Icon name="Discord" size={32} />
					Login
				</Link>{' '}
				<span>
					to get access to the exclusive{' '}
					<Link to="/discord" className="underline">
						discord channel
					</Link>
					.
				</span>
			</div>
		)
	}
	if (user && !discordMember) {
		return (
			<div className="flex flex-wrap items-center justify-center gap-2 text-xl">
				<Link to={discordAuthUrl} className="flex items-center gap-2 underline">
					<Icon name="Discord" size={32} />
					Connect Discord
				</Link>{' '}
				<span>
					to get access to the exclusive{' '}
					<Link to="/discord" className="underline">
						discord channel
					</Link>
					.
				</span>
			</div>
		)
	}

	if (user && discordMember) {
		return (
			<div className="flex items-center justify-center gap-2 text-xl underline">
				<Link to="discord://discord.com/channels/715220730605731931/1161045224907341972">
					<Icon name="Discord" size={32} />
				</Link>
				<Link
					to="https://discord.com/channels/715220730605731931/1161045224907341972"
					target="_blank"
					rel="noreferrer noopener"
				>
					Open Discord
				</Link>
			</div>
		)
	}

	return (
		<Link
			to="https://kentcdodds.com/discord"
			className="flex items-center gap-2 underline"
		>
			<Icon name="Discord" size={32} />
			Learn about discord
		</Link>
	)
}

export default function () {
	const data = useLoaderData<typeof loader>()

	return (
		<div className="container flex h-full max-w-3xl flex-col items-center justify-center gap-4 p-12">
			<DiscordCTA discordAuthUrl={data.discordAuthUrl} />
			<p>
				The{' '}
				<Link
					target="_blank"
					rel="noreferrer noopener"
					className="underline"
					to="https://kentcdodds.com/discord"
				>
					KCD Community on Discord
				</Link>{' '}
				is a great place to hang out with other developers who are working
				through this workshop. You can ask questions, get help, and solidify
				what you're learning by helping others.
			</p>
			<p>
				<small className="text-sm">
					If you've not joined the KCD Community on Discord yet, you'll be
					required to go through a short onboarding process first. A friendly
					bot will explain the process when you{' '}
					<Link
						to="https://kcd.im/discord"
						target="_blank"
						rel="noreferrer noopener"
						className="underline"
					>
						join
					</Link>
					.
				</small>
			</p>
		</div>
	)
}
