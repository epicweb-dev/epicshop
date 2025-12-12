import { useParams } from 'react-router'
import { useRootLoaderData } from '#app/utils/root-loader.ts'

export function useOptionalUser() {
	const data = useRootLoaderData()
	return data.user
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
	const data = useRootLoaderData()
	return data.user?.discordProfile?.user
		? {
				id: data.user.discordProfile.user.id,
				displayName:
					data.user.discordProfile.nick ??
					data.user.discordProfile.user.global_name ??
					data.user.name ??
					data.user.email,
				avatarUrl: data.user.imageUrlLarge,
			}
		: null
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
	const data = useRootLoaderData()
	return data.userHasAccess
}

export function useUserHasAccessToLesson(exerciseNumber?: number) {
	const data = useRootLoaderData()
	const params = useParams()

	// Full workshop access implies lesson access.
	if (data.userHasAccess) return true

	const inferredExerciseNumber =
		exerciseNumber ??
		(params.exerciseNumber ? Number(params.exerciseNumber) : undefined)

	if (!inferredExerciseNumber || !Number.isFinite(inferredExerciseNumber)) {
		return false
	}

	return Boolean(
		data.lessonFirstEpicVideoAccess?.[inferredExerciseNumber] ?? false,
	)
}
