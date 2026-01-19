import {
	getAppDisplayName,
	getAppPageRoute,
	getApps,
	getExerciseApp,
	getNextExerciseApp,
	getPrevExerciseApp,
	isExerciseStepApp,
	isPlaygroundApp,
	requireExercise,
	requireExerciseApp,
	type App,
	type ExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getDiffFiles } from '@epic-web/workshop-utils/diff.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import slugify from '@sindresorhus/slugify'
import * as cookie from 'cookie'
import { data, redirect, type HeadersFunction } from 'react-router'
import { getRootMatchLoaderData } from '#app/utils/root-loader-utils.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'
import { getStep404Data } from '../__shared/error-boundary.server.ts'
import { type Route } from './+types/_layout.tsx'
import { ExerciseStepLayoutClient } from './__shared/exercise-step-layout.client.tsx'
import { computeSplitPercent, splitCookieName } from './__shared/split-utils.ts'
import { getStepTitleBits } from './__shared/step-layout-utils.ts'

export const meta: Route.MetaFunction = ({ loaderData, matches, params }) => {
	const rootData = getRootMatchLoaderData(matches)
	if (!loaderData || !rootData) return [{ title: '🦉 | Error' }]
	const { emoji, stepNumber, title, exerciseNumber, exerciseTitle } =
		getStepTitleBits(loaderData)

	return getSeoMetaTags({
		title: `${emoji} | ${stepNumber}. ${title} | ${exerciseNumber}. ${exerciseTitle} | ${rootData.workshopTitle}`,
		description: `${params.type} step for exercise ${exerciseNumber}. ${exerciseTitle}`,
		ogTitle: title,
		ogDescription: `${exerciseTitle} step ${Number(stepNumber)} ${params.type}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const timings = makeTimings('exerciseStepTypeLayoutLoader')
	const url = new URL(request.url)
	const { type } = params
	const { title: workshopTitle } = getWorkshopConfig()

	const cacheOptions = { request, timings }

	const [allAppsFull, problemApp, solutionApp] = await Promise.all([
		getApps(cacheOptions),
		getExerciseApp({ ...params, type: 'problem' }, cacheOptions),
		getExerciseApp({ ...params, type: 'solution' }, cacheOptions),
	])

	const reqUrl = new URL(request.url)
	const pathnameParam = reqUrl.searchParams.get('pathname')
	if (pathnameParam === '' || pathnameParam === '/') {
		reqUrl.searchParams.delete('pathname')
		throw redirect(reqUrl.toString())
	}

	if (
		(type === 'problem' && !problemApp) ||
		(type === 'solution' && !solutionApp)
	) {
		const errorData = await getStep404Data({
			exerciseNumber: params.exerciseNumber,
		})
		throw Response.json(errorData, { status: 404 })
	}

	const exerciseStepApp = await requireExerciseApp(params, cacheOptions)

	const playgroundApp = allAppsFull.find(isPlaygroundApp)

	function getStepId(a: ExerciseStepApp) {
		return (
			a.exerciseNumber * 1000 +
			a.stepNumber * 10 +
			(a.type === 'problem' ? 0 : 1)
		)
	}

	function getStepNameAndId(a: App) {
		if (isExerciseStepApp(a)) {
			const exerciseNumberStr = String(a.exerciseNumber).padStart(2, '0')
			const stepNumberStr = String(a.stepNumber).padStart(2, '0')

			return {
				stepName: `${exerciseNumberStr}/${stepNumberStr}.${a.type}`,
				stepId: getStepId(a),
			}
		}
		return { stepName: '', stepId: -1 }
	}

	const allApps = allAppsFull
		.filter((a, i, ar) => ar.findIndex((b) => a.name === b.name) === i)
		.map((a) => ({
			displayName: getAppDisplayName(a, allAppsFull),
			name: a.name,
			title: a.title,
			type: a.type,
			...getStepNameAndId(a),
		}))

	allApps.sort((a, b) => {
		// order them by their stepId
		if (a.stepId > 0 && b.stepId > 0) return a.stepId - b.stepId

		// non-step apps should come after step apps
		if (a.stepId > 0) return -1
		if (b.stepId > 0) return 1

		return 0
	})
	const exerciseId = getStepId(exerciseStepApp)
	const exerciseIndex = allApps.findIndex((step) => step.stepId === exerciseId)

	// These depend on exerciseStepApp
	const [exercise, nextApp, prevApp] = await Promise.all([
		requireExercise(exerciseStepApp.exerciseNumber, cacheOptions),
		getNextExerciseApp(exerciseStepApp, cacheOptions),
		getPrevExerciseApp(exerciseStepApp, cacheOptions),
	])

	const exerciseApps = allAppsFull
		.filter(isExerciseStepApp)
		.filter((app) => app.exerciseNumber === exerciseStepApp.exerciseNumber)
	const isLastStep =
		exerciseApps[exerciseApps.length - 1]?.name === exerciseStepApp.name
	const isFirstStep = exerciseApps[0]?.name === exerciseStepApp.name

	const articleId = `workshop-${slugify(workshopTitle)}-${
		exercise.exerciseNumber
	}-${exerciseStepApp.stepNumber}-${exerciseStepApp.type}`

	const subroute = url.pathname.split(
		`/exercise/${params.exerciseNumber}/${params.stepNumber}/${params.type}/`,
	)[1]

	// read persisted split percentage from cookie (10-90, default 50)
	const cookieHeader = request.headers.get('cookie')
	const rawSplit = cookieHeader
		? cookie.parse(cookieHeader)[splitCookieName]
		: null
	const splitPercent = computeSplitPercent(rawSplit, 50)

	return data(
		{
			articleId,
			type: params.type as 'problem' | 'solution',
			exerciseStepApp,
			exerciseTitle: exercise.title,
			epicVideoInfosPromise: getEpicVideoInfos(exerciseStepApp.epicVideoEmbeds),
			exerciseIndex,
			allApps,
			splitPercent,
			prevStepLink: isFirstStep
				? {
						to: `/exercise/${exerciseStepApp.exerciseNumber
							.toString()
							.padStart(2, '0')}`,
					}
				: prevApp
					? {
							to: getAppPageRoute(prevApp, {
								subroute,
								searchParams: url.searchParams,
							}),
						}
					: null,
			nextStepLink: isLastStep
				? {
						to: `/exercise/${exerciseStepApp.exerciseNumber
							.toString()
							.padStart(2, '0')}/finished`,
					}
				: nextApp
					? {
							to: getAppPageRoute(nextApp, {
								subroute,
								searchParams: url.searchParams,
							}),
						}
					: null,
			playground: playgroundApp
				? ({
						type: 'playground',
						appName: playgroundApp.appName,
						name: playgroundApp.name,
						fullPath: playgroundApp.fullPath,
						dev: playgroundApp.dev,
						isUpToDate: playgroundApp.isUpToDate,
					} as const)
				: null,
			problem: problemApp
				? ({
						type: 'problem',
						title: problemApp.title,
						name: problemApp.name,
						fullPath: problemApp.fullPath,
						dev: problemApp.dev,
					} as const)
				: null,
			solution: solutionApp
				? ({
						type: 'solution',
						title: solutionApp.title,
						name: solutionApp.name,
						fullPath: solutionApp.fullPath,
						dev: solutionApp.dev,
					} as const)
				: null,
			diffFiles:
				problemApp && solutionApp
					? getDiffFiles(problemApp, solutionApp, {
							...cacheOptions,
							forceFresh: url.searchParams.get('forceFresh') === 'diff',
						}).catch((e) => {
							console.error(e)
							return 'There was a problem generating the diff (check the terminal output)'
						})
					: 'No diff available',
		} as const,
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export function ServerComponent({ loaderData }: Route.ComponentProps) {
	return <ExerciseStepLayoutClient loaderData={loaderData} />
}

export { ErrorBoundary } from './__shared/exercise-step-layout.client.tsx'
