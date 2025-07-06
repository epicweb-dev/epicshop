import { invariant } from '@epic-web/invariant'
import {
	getApps,
	getExerciseApp,
	getPlaygroundAppName,
	isExerciseStepApp,
	isProblemApp,
	setPlayground,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { deleteCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	getAuthInfo,
	logout,
	setAuthInfo,
} from '@epic-web/workshop-utils/db.server'
import {
	getProgress,
	getUserInfo,
	updateProgress,
} from '@epic-web/workshop-utils/epic-api.server'
import * as client from 'openid-client'
import { z } from 'zod'
import { handleWorkshopDirectory, workshopDirectoryInputSchema } from './utils.js'

export const loginSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function loginTool(input: z.infer<typeof loginSchema>) {
	const { workshopDirectory } = input
	await handleWorkshopDirectory(workshopDirectory)
	const {
		product: { host },
	} = getWorkshopConfig()
	const ISSUER = `https://${host}/oauth`
	const config = await client.discovery(new URL(ISSUER), 'EPICSHOP_APP')
	const deviceResponse = await client.initiateDeviceAuthorization(
		config,
		{},
	)

	console.log(`Please go to ${deviceResponse.verification_uri_complete}`)
	console.log(`Verify the code on the page is "${deviceResponse.user_code}" to login.`)

	const UserInfoSchema = z.object({
		id: z.string(),
		email: z.string(),
		name: z.string().nullable().optional(),
	})

	const timeout = setTimeout(() => {
		console.log('Device authorization timed out')
		process.exit(1)
	}, deviceResponse.expires_in * 1000)

	try {
		const tokenSet = await client.pollDeviceAuthorizationGrant(
			config,
			deviceResponse,
		)
		clearTimeout(timeout)

		if (!tokenSet) {
			console.log('No token set')
			return
		}

		const protectedResourceResponse = await client.fetchProtectedResource(
			config,
			tokenSet.access_token,
			new URL(`${ISSUER}/userinfo`),
			'GET',
		)
		const userinfoRaw = await protectedResourceResponse.json()
		const userinfoResult = UserInfoSchema.safeParse(userinfoRaw)
		if (!userinfoResult.success) {
			console.log(`Failed to parse user info: ${userinfoResult.error.message}`)
			return
		}
		const userinfo = userinfoResult.data

		await setAuthInfo({
			id: userinfo.id,
			tokenSet,
			email: userinfo.email,
			name: userinfo.name,
		})

		await getUserInfo({ forceFresh: true })

		console.log('Authentication successful')
	} catch (error) {
		clearTimeout(timeout)
		throw error
	}
}

export const logoutSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
})

export async function logoutTool(input: z.infer<typeof logoutSchema>) {
	const { workshopDirectory } = input
	await handleWorkshopDirectory(workshopDirectory)
	await logout()
	await deleteCache()
	console.log('Logged out')
}

export const setPlaygroundSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
	exerciseNumber: z.coerce
		.number()
		.optional()
		.describe('The exercise number to set the playground to'),
	stepNumber: z.coerce
		.number()
		.optional()
		.describe('The step number to set the playground to'),
	type: z
		.enum(['problem', 'solution'])
		.optional()
		.describe('The type of app to set the playground to'),
})

export async function setPlaygroundTool(input: z.infer<typeof setPlaygroundSchema>) {
	const { workshopDirectory, exerciseNumber, stepNumber, type } = input
	const resolvedWorkshopDirectory = await handleWorkshopDirectory(workshopDirectory)
	const authInfo = await getAuthInfo()

	if (authInfo) {
		const progress = await getProgress()
		const scoreProgress = (a: (typeof progress)[number]) => {
			if (a.type === 'workshop-instructions') return 0
			if (a.type === 'workshop-finished') return 10000
			if (a.type === 'instructions') return a.exerciseNumber * 100
			if (a.type === 'step') return a.exerciseNumber * 100 + a.stepNumber
			if (a.type === 'finished') return a.exerciseNumber * 100 + 100

			if (a.type === 'unknown') return 100000
			return -1
		}
		const sortedProgress = progress.sort((a, b) => {
			return scoreProgress(a) - scoreProgress(b)
		})
		const nextProgress = sortedProgress.find((p) => !p.epicCompletedAt)
		if (nextProgress) {
			if (nextProgress.type === 'step') {
				const exerciseApp = await getExerciseApp({
					exerciseNumber: nextProgress.exerciseNumber.toString(),
					stepNumber: nextProgress.stepNumber.toString(),
					type: 'problem',
				})
				invariant(exerciseApp, 'No exercise app found')
				await setPlayground(exerciseApp.fullPath)
				console.log(`Playground set to ${exerciseApp.exerciseNumber}.${exerciseApp.stepNumber}.${exerciseApp.type}`)
				return
			}

			if (
				nextProgress.type === 'instructions' ||
				nextProgress.type === 'finished'
			) {
				throw new Error(
					`The user needs to mark the ${nextProgress.exerciseNumber} ${nextProgress.type === 'instructions' ? 'instructions' : 'finished'} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
				)
			}
			if (
				nextProgress.type === 'workshop-instructions' ||
				nextProgress.type === 'workshop-finished'
			) {
				throw new Error(
					`The user needs to mark the ${nextProgress.exerciseNumber} ${nextProgress.type === 'workshop-instructions' ? 'Workshop instructions' : 'Workshop finished'} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
				)
			}

			throw new Error(
				`The user needs to mark ${nextProgress.epicLessonSlug} as complete before they can continue. Have them watch the video at ${nextProgress.epicLessonUrl}, then mark it as complete.`,
			)
		}
	}

	const apps = await getApps()
	const exerciseStepApps = apps.filter(isExerciseStepApp)

	const playgroundAppName = await getPlaygroundAppName()
	const currentExerciseStepAppIndex = exerciseStepApps.findIndex(
		(a) => a.name === playgroundAppName,
	)

	let desiredApp: ExerciseStepApp | undefined
	// if nothing was provided, set to the next step problem app
	const noArgumentsProvided = !exerciseNumber && !stepNumber && !type
	if (noArgumentsProvided) {
		desiredApp = exerciseStepApps
			.slice(currentExerciseStepAppIndex + 1)
			.find(isProblemApp)
		invariant(desiredApp, 'No next problem app found to set playground to')
	} else {
		const currentExerciseStepApp =
			exerciseStepApps[currentExerciseStepAppIndex]

		// otherwise, default to the current exercise step app for arguments
		const resolvedExerciseNumber = exerciseNumber ?? currentExerciseStepApp?.exerciseNumber
		const resolvedStepNumber = stepNumber ?? currentExerciseStepApp?.stepNumber
		const resolvedType = type ?? currentExerciseStepApp?.type

		desiredApp = exerciseStepApps.find(
			(a) =>
				a.exerciseNumber === resolvedExerciseNumber &&
				a.stepNumber === resolvedStepNumber &&
				a.type === resolvedType,
		)
	}

	invariant(
		desiredApp,
		`No app found for values derived by the arguments: ${exerciseNumber}.${stepNumber}.${type}`,
	)
	await setPlayground(desiredApp.fullPath)
	console.log(`Playground set to ${desiredApp.name}`)
}

export const updateProgressSchema = z.object({
	workshopDirectory: workshopDirectoryInputSchema,
	epicLessonSlug: z
		.string()
		.describe(
			'The slug of the Epic lesson to mark as complete (can be retrieved from the `get_exercise_context` tool or the `get_workshop_context` tool)',
		),
	complete: z
		.boolean()
		.optional()
		.default(true)
		.describe(
			'Whether to mark the lesson as complete or incomplete (defaults to true)',
		),
})

export async function updateProgressTool(input: z.infer<typeof updateProgressSchema>) {
	const { workshopDirectory, epicLessonSlug, complete } = input
	await handleWorkshopDirectory(workshopDirectory)
	await updateProgress({ lessonSlug: epicLessonSlug, complete })
	console.log(`Lesson with slug ${epicLessonSlug} marked as ${complete ? 'complete' : 'incomplete'}`)
}