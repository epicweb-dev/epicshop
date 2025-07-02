import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import {
	useOptionalDiscordMember,
	useOptionalUser,
} from '#app/components/user.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

function useConnectDiscordURL() {
	const {
		product: { host },
	} = useWorkshopConfig()
	return `https://${host}/discord`
}

export function useDiscordCTALink() {
	const user = useOptionalUser()
	const discordMember = useOptionalDiscordMember()
	const connectDiscordURL = useConnectDiscordURL()

	if (!user) {
		return '/login'
	}
	if (!discordMember) {
		return connectDiscordURL
	}

	return 'https://discord.com/channels/715220730605731931/1161045224907341972'
}

export function DiscordCTA() {
	const user = useOptionalUser()
	const discordMember = useOptionalDiscordMember()
	const connectDiscordURL = useConnectDiscordURL()
	if (!user) {
		return (
			<div className="flex flex-wrap items-center justify-center gap-2 text-xl">
				<Link to="/login" className="inline-flex items-center gap-2 underline">
					<Icon name="Discord" size="2xl" />
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
	if (!discordMember) {
		return (
			<div className="flex flex-wrap items-center justify-center gap-2 text-xl">
				<Link
					to={connectDiscordURL}
					className="flex items-center gap-2 underline"
				>
					<Icon name="Discord" size="2xl" />
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

	return (
		<div className="flex items-center justify-center gap-2 text-xl underline">
			<Link to="discord://discord.com/channels/715220730605731931/1161045224907341972">
				<Icon name="Discord" size="2xl" />
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

export default function DiscordRoute() {
	return (
		<div className="container flex h-full max-w-3xl flex-col items-center justify-center gap-4 p-12">
			<DiscordCTA />
			<p>
				The{' '}
				<Link
					target="_blank"
					rel="noreferrer noopener"
					className="underline"
					to="https://kentcdodds.com/discord"
				>
					Epic Web Community on Discord
				</Link>{' '}
				is a great place to hang out with other developers who are working
				through this workshop. You can ask questions, get help, and solidify
				what you're learning by helping others.
			</p>
			<p>
				<small className="text-sm">
					If you've not joined the Epic Web Community on Discord yet, you'll be
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
