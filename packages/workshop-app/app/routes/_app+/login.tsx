import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, redirect } from '@remix-run/node'
import {
	useFetcher,
	useLoaderData,
	useNavigate,
	useRevalidator,
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { useEventSource } from 'remix-utils/sse/react'
import { Button, ButtonLink } from '#app/components/button.tsx'
import { Loading } from '#app/components/loading.tsx'
import { Logo } from '#app/components/product.tsx'
import { useWorkshopConfig } from '#app/components/workshop-config.js'
import { EVENTS } from '#app/utils/auth-events.ts'
import { registerDevice } from '#app/utils/auth.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { EventSchema } from '../login-sse.tsx'
import { useTheme } from '../theme/index.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader() {
	ensureUndeployed()
	const isAuthenticated = Boolean(await getAuthInfo())
	if (isAuthenticated) throw redirect('/account')
	return json({})
}

export async function action() {
	ensureUndeployed()
	void registerDevice()
	return json({ status: 'pending' } as const)
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
				revalidator.revalidate()
				navigate('/')
				break
			}
			case EVENTS.AUTH_REJECTED: {
				setAuthError(result.data.error)
				break
			}
		}
	}, [lastMessage, navigate, revalidator])

	return (
		<main className="flex h-full w-full flex-grow flex-col items-center justify-center p-10 text-center">
			<div className="flex flex-col items-center">
				<Logo className="h-16 w-16" />
				<h1 className="pt-5 text-2xl font-semibold md:text-3xl">
					Authenticate with {displayName}
				</h1>
				<h2 className="max-w-sm pt-3 text-base text-gray-700 dark:text-gray-300">
					If you have purchased {displayName}, you'll be able to watch videos,
					track progress, and more!
				</h2>
				<div className="flex w-full flex-col items-center pt-5">
					{userCodeInfo ? (
						<div className="flex w-full flex-col items-center gap-3">
							<div className="my-2 flex w-full flex-col items-center gap-2">
								<p className="text-lg">Your verification code is: </p>
								<div className="mb-3 w-full bg-gray-100 px-5 py-3 text-lg font-bold dark:bg-black/40">
									<code>{userCodeInfo.code}</code>
								</div>
							</div>
							<ButtonLink
								varient="primary"
								to={userCodeInfo.url}
								target="_blank"
								rel="noreferrer"
								onClick={() => setClickedVerificationLink(true)}
							>
								Continue
							</ButtonLink>
							{clickedVerificationLink ? (
								<div className="pt-5 opacity-60">
									<Loading>Waiting for confirmation</Loading>
								</div>
							) : null}
						</div>
					) : (
						<loginFetcher.Form method="POST">
							<Button varient="primary" type="submit">
								{loginFetcher.state === 'idle' &&
								loginFetcher.data?.status !== 'pending'
									? `Retrieve Code`
									: `Retrieving Code...`}
							</Button>
						</loginFetcher.Form>
					)}
					{authError ? (
						<div className="mt-4 text-red-500">
							There was an error: <pre>{authError}</pre>
						</div>
					) : null}
				</div>
			</div>
		</main>
	)
}
