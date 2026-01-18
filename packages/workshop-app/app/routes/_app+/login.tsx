import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useEffect, useState } from 'react'
import {
	redirect,
	Link,
	useFetcher,
	useNavigate,
	useRevalidator,
} from 'react-router'
import { useEventSource } from 'remix-utils/sse/react'
import { Button, ButtonLink } from '#app/components/button.tsx'
import { Loading } from '#app/components/loading.tsx'
import { Logo } from '#app/components/product.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.tsx'
import { EVENTS } from '#app/utils/auth-events.ts'
import { registerDevice } from '#app/utils/auth.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { EventSchema } from '../login-sse.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader() {
	ensureUndeployed()
	const isAuthenticated = Boolean(await getAuthInfo())
	if (isAuthenticated) throw redirect('/account')
	return {}
}

export async function action() {
	ensureUndeployed()
	void registerDevice()
	return { status: 'pending' } as const
}

export default function Login() {
	const {
		product: { displayName },
	} = useWorkshopConfig()
	const loginFetcher = useFetcher<typeof action>()
	const [clickedVerificationLink, setClickedVerificationLink] = useState(false)
	const [authError, setAuthError] = useState<null | string>(null)
	const [userCodeInfo, setUserCodeInfo] = useState<null | {
		code: string
		url: string
	}>(null)
	const navigate = useNavigate()
	const revalidator = useRevalidator()
	const lastMessage = useEventSource(`/login-sse`)
	useEffect(() => {
		if (!lastMessage) return

		const parsed = JSON.parse(lastMessage)
		const result = EventSchema.safeParse(parsed)
		if (!result.success) {
			console.error(result.error.flatten())
			return
		}
		switch (result.data.type) {
			case EVENTS.USER_CODE_RECEIVED: {
				setUserCodeInfo(result.data)
				break
			}
			case EVENTS.AUTH_RESOLVED: {
				void revalidator.revalidate().then(() => navigate('/'))
				break
			}
			case EVENTS.AUTH_REJECTED: {
				setAuthError(result.data.error)
				break
			}
		}
	}, [lastMessage, navigate, revalidator])

	return (
		<main className="flex h-full w-full grow flex-col items-center justify-center p-10">
			<div className="flex flex-col items-center">
				<Logo className="h-16 w-16" />
				<h1 className="pt-5 text-2xl font-semibold md:text-3xl">
					Login to {displayName}
				</h1>
				<div className="flex w-full flex-col items-center pt-5">
					{userCodeInfo ? (
						<div className="flex w-full max-w-md flex-col items-center gap-3">
							<div className="my-2 flex w-full flex-col items-center gap-2">
								<p className="text-lg">Your verification code is: </p>
								<div className="bg-muted mb-3 w-full px-5 py-3 text-center text-lg font-bold">
									<code>{userCodeInfo.code}</code>
								</div>
								<p className="text-base">
									You'll use this to verify your device on {displayName}. Click
									verify code below to open the verification page.
								</p>
							</div>
							<ButtonLink
								varient="primary"
								to={userCodeInfo.url}
								target="_blank"
								rel="noreferrer"
								onClick={() => setClickedVerificationLink(true)}
							>
								Verify Auth Code
							</ButtonLink>
							{clickedVerificationLink ? (
								<div className="justify-center pt-5 text-center opacity-60">
									<Loading className="justify-center">
										Waiting for confirmation
									</Loading>
									<p className="pt-2">
										Please open{' '}
										<a
											href={userCodeInfo.url}
											target="_blank"
											className="underline"
										>
											your auth page
										</a>{' '}
										in a new tab to continue.
									</p>
								</div>
							) : null}
						</div>
					) : (
						<div className="flex flex-col items-center gap-8">
							<div className="text-muted-foreground flex max-w-lg flex-col gap-3 pt-3 text-base">
								<p>
									If you have access to this workshop on {displayName}, you'll
									be able to watch videos, track progress, run tests, view the
									diffs, and more!
								</p>
								<p>
									First you need to authenticate your device by requesting an
									access code and verifying on {displayName}.
								</p>
							</div>
							<loginFetcher.Form method="POST">
								<Button varient="primary" type="submit">
									{loginFetcher.state === 'idle' &&
									loginFetcher.data?.status !== 'pending'
										? `Retrieve Auth Code`
										: `Retrieving Auth Code...`}
								</Button>
							</loginFetcher.Form>
						</div>
					)}
					{authError ? (
						<>
							<div className="text-foreground-destructive mt-4">
								There was an error: <pre>{authError}</pre>
							</div>
							<div className="text-foreground-destructive mt-4">
								Please try again or{' '}
								<Link to="/support" className="underline">
									contact support
								</Link>{' '}
								if the problem persists.
							</div>
						</>
					) : null}
				</div>
			</div>
		</main>
	)
}
