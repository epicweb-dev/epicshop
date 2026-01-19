import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import {
	logout,
	requireAuthInfo,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect, type LoaderFunctionArgs, Form, Link } from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Icon } from '#app/components/icons.tsx'
import {
	OnboardingBadge,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import {
	useOptionalDiscordMember,
	useUser,
	useUserHasAccess,
} from '#app/components/user.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { cn, ensureUndeployed } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	await requireAuthInfo({ request })
	return {}
}

export async function action({ request }: { request: Request }) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	if (intent === 'logout') {
		await logout()
		await deleteCache()
		return redirectWithToast('/login', {
			type: 'success',
			title: 'Logged out',
			description: 'Goodbye! Come back soon!',
		})
	} else if (intent === 'presence-opt-out') {
		const optOut = formData.get('optOut') === 'true'
		await setPreferences({ presence: { optOut } })
		return redirectWithToast('/account', {
			title: optOut ? 'Opted out' : 'Opted in',
			description: `You are now ${optOut ? 'invisible' : 'visible'}.`,
			type: 'success',
		})
	}

	return redirect('/account')
}

function useConnectDiscordURL() {
	const {
		product: { host },
	} = useWorkshopConfig()
	return `https://${host}/discord`
}

export default function Account() {
	const user = useUser()
	const config = useWorkshopConfig()
	const discordMember = useOptionalDiscordMember()
	const connectDiscordURL = useConnectDiscordURL()
	const userHasAccess = useUserHasAccess()

	// Onboarding indicators
	const [showGuideBadge, dismissGuideBadge] =
		useOnboardingIndicator('account-guide')
	const [showPreferencesBadge, dismissPreferencesBadge] =
		useOnboardingIndicator('account-preferences')

	return (
		<main className="container flex h-full w-full max-w-3xl grow flex-col items-center justify-center gap-4">
			<div className="flex flex-col items-center">
				{user.imageUrlLarge ? (
					<img
						className="h-36 w-36 rounded-full"
						alt={discordMember?.displayName ?? user.name ?? user.email}
						src={user.imageUrlLarge}
					/>
				) : (
					<div className="bg-muted flex h-36 w-36 items-center justify-center rounded-full">
						<Icon name="User" size="xl" />
					</div>
				)}
				<p className="text-muted-foreground mt-2 text-center text-xs">
					{discordMember ? (
						<>
							Photo from{' '}
							<a
								href="https://discord.com/channels/@me"
								target="_blank"
								rel="noopener noreferrer"
								className="underline"
							>
								Discord
							</a>
						</>
					) : (
						<>
							Photo from{' '}
							<a
								href="https://gravatar.com"
								target="_blank"
								rel="noopener noreferrer"
								className="underline"
							>
								Gravatar
							</a>{' '}
							or connect Discord below
						</>
					)}
				</p>
			</div>

			<div className="flex items-center gap-2">
				<h1 className="mb-1 text-2xl">Your Account</h1>
				{config.product.slug ? (
					<SimpleTooltip
						content={
							userHasAccess
								? 'You have access to this workshop'
								: 'You do not have full access to this workshop'
						}
					>
						<Icon
							name={userHasAccess ? 'Success' : 'Error'}
							size="lg"
							className={cn(
								userHasAccess
									? 'bg-success text-success-foreground'
									: 'bg-warning text-warning-foreground',
								'rounded-full p-1',
							)}
							tabIndex={0}
						/>
					</SimpleTooltip>
				) : null}
			</div>

			{!userHasAccess && config.product.slug ? (
				<div className="prose">
					<callout-warning className="notification">
						Please{' '}
						<a
							href={`https://${config.product.host}/workshops/${config.product.slug}`}
							className="underline"
						>
							upgrade
						</a>{' '}
						your account to get full access to this workshop.
					</callout-warning>
				</div>
			) : null}
			<p className="text-muted-foreground text-center">
				{user.name
					? `Hi ${
							discordMember?.displayName ?? user.name
						}, your device is logged in with ${user.email}.`
					: `Your device is logged in with ${user.email}.`}
			</p>
			{discordMember ? (
				<>
					<p className="text-muted-foreground text-center">
						And you are connected to discord as{' '}
						<a
							href={`https://discord.com/users/${discordMember.id}`}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							{discordMember.displayName}
						</a>
						.
					</p>
				</>
			) : (
				<div className="flex items-center gap-2">
					<Link
						to={connectDiscordURL}
						className="inline-flex items-center gap-2 underline"
					>
						<Icon name="Discord" size="lg" />
						Connect Discord
					</Link>
					<SimpleTooltip content="This will give you access to the exclusive Discord channels for Epic Web">
						<Icon name="Question" tabIndex={0} />
					</SimpleTooltip>
				</div>
			)}
			<div className="flex items-center gap-2">
				<Form method="post">
					<Button varient="mono" name="intent" value="logout">
						Log device out
					</Button>
				</Form>
				<SimpleTooltip
					content={
						<div>
							Note: it is your <i className="italic">device</i> that's logged
							in, not your browser.
							<br />
							So all browsers on this device will be logged in with the same
							account on this device.
						</div>
					}
				>
					<Icon name="Question" tabIndex={0} />
				</SimpleTooltip>
			</div>
			<hr className="w-full" />
			<ul className="flex list-inside list-disc flex-col gap-2 self-start">
				<li>
					<Link
						to={`https://${config.product.host}/profile`}
						className="inline-flex gap-1 underline"
					>
						<span>Manage your account</span>
						<Icon name="ExternalLink" />
					</Link>
				</li>
				<li>
					<Link
						to="/preferences"
						className="relative underline"
						onClick={dismissPreferencesBadge}
					>
						{showPreferencesBadge ? (
							<OnboardingBadge
								tooltip="Customize your workshop experience!"
								size="sm"
								className="-top-1 -left-4"
							/>
						) : null}
						Manage your preferences
					</Link>
				</li>
				<li>
					<Link
						to="/guide"
						className="relative underline"
						onClick={dismissGuideBadge}
					>
						{showGuideBadge ? (
							<OnboardingBadge
								tooltip="Learn how to use the workshop app!"
								size="sm"
								className="-top-1 -left-4"
							/>
						) : null}
						Workshop app guide
					</Link>
				</li>
				<li>
					<Link to="/support" className="underline">
						Get support
					</Link>
				</li>
			</ul>
		</main>
	)
}
