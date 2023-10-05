import { json, redirect } from '@remix-run/node'
import { useFetcher, useNavigate, useRevalidator } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { useEventSource } from 'remix-utils/use-event-source'
import { Button, ButtonLink } from '#app/components/button.tsx'
import { Loading } from '#app/components/loading.tsx'
import { EVENTS } from '#app/utils/auth-events.ts'
import { registerDevice } from '#app/utils/auth.server.ts'
import { getAuthInfo } from '#app/utils/db.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { EventSchema } from '../login-sse.tsx'

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
	const loginFetcher = useFetcher<typeof action>()
	const [clickedVerificationLink, setClickedVerificationLink] = useState(false)
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
		}
	}, [lastMessage, navigate, revalidator])

	return (
		<main>
			<div className="mt-6 md:mt-12">
				<h1 className="text-xl">Login</h1>
				{userCodeInfo ? (
					<div className="flex flex-col gap-2">
						{/* eslint-disable-next-line react/jsx-no-target-blank */}
						<ButtonLink
							varient="primary"
							to={userCodeInfo.url}
							target="_blank"
							rel="noreferrer"
							onClick={() => setClickedVerificationLink(true)}
						>
							Login
						</ButtonLink>
						<div>
							Your verification code is: <code>{userCodeInfo.code}</code>.
						</div>
						{clickedVerificationLink ? (
							<div>
								<Loading>Waiting for verification</Loading>
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
			</div>
		</main>
	)
}
