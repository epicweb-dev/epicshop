import { getAuthInfo } from '@epic-web/workshop-utils/db.server'
import { json, redirect } from '@remix-run/node'
import { useFetcher, useNavigate, useRevalidator } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { useEventSource } from 'remix-utils/sse/react'
import { EventSchema } from '../login-sse.tsx'
import { Button, ButtonLink } from '#app/components/button.tsx'
import { Loading } from '#app/components/loading.tsx'
import { EVENTS } from '#app/utils/auth-events.ts'
import { registerDevice } from '#app/utils/auth.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'

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
					Authenticate with EpicWeb.dev
				</h1>
				<h2 className="max-w-sm pt-3 text-base text-gray-700 dark:text-gray-300">
					If you have purchased Epic Web, you'll be able to watch videos, track
					progress, and more!
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

function Logo({ className = '' }) {
	// svg sprites do not support gradients
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M12.438 11.5677C12.0131 11.8026 11.5249 12.0534 10.9784 12.3047C8.80704 13.3031 5.70429 14.314 1.986 14.3555L1.55773 14.3603L1.48003 13.9391C1.36509 13.316 1.29793 12.6714 1.29793 12.006C1.29793 6.10441 6.09863 1.30372 12.0002 1.30372C13.6287 1.30372 15.1745 1.66961 16.5585 2.32369L17.9801 1.59897C16.2189 0.582162 14.1769 0 12.0002 0C5.38709 0 0 5.38709 0 12.0002C0 14.6402 0.858474 17.0847 2.31072 19.0692C4.79741 18.6457 6.35749 17.6495 6.35749 17.6495C6.35749 17.6495 5.36137 19.2075 4.93785 21.6946C6.92114 23.1439 9.36321 24.0005 12.0002 24.0005C18.6134 24.0005 24.0005 18.6134 24.0005 12.0002C24.0005 9.82732 23.4199 7.78762 22.4053 6.02738L21.6818 7.44613C22.3364 8.83057 22.7025 10.3769 22.7025 12.006C22.7025 17.9076 17.9018 22.7083 12.0002 22.7083C11.3345 22.7083 10.6959 22.6411 10.0681 22.5264L9.646 22.4493L9.65079 22.0203C9.6923 18.2991 10.7031 15.1964 11.7016 13.0257C11.9527 12.4797 12.2033 11.9921 12.438 11.5677Z"
				fill="url(#epicGradient)"
			/>
			<path
				d="M18.2525 9.31052L15.4992 8.50683L14.6953 5.74778L23.8291 0.171387L18.2525 9.31052Z"
				fill="currentColor"
			/>
			<defs>
				<linearGradient
					id="epicGradient"
					x1="16.9703"
					y1="7.03022"
					x2="7.05798"
					y2="16.948"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#4F75FF" />
					<stop offset="1" stopColor="#30AFFF" />
				</linearGradient>
			</defs>
		</svg>
	)
}
