import { useRouteLoaderData } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'

export function useOptionalUser() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.user
}

export function useUser() {
	const user = useOptionalUser()
	if (!user) {
		throw new Error(
			'useUser requires a user. If the user is optional, use useOptionalUser instead.',
		)
	}
	return user
}

export function useOptionalDiscordMember() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.discordMember
}

export function useDiscordMember() {
	const discordMember = useOptionalDiscordMember()
	if (!discordMember) {
		throw new Error(
			'useDiscordMember requires a discordMember. If the discordMember is optional, use useOptionalDiscordMember instead.',
		)
	}
	return discordMember
}

export function useUserHasAccess() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.userHasAccess ?? false
}
