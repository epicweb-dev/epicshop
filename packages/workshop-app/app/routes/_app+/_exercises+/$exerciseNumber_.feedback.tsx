import type {
	DataFunctionArgs,
	HeadersFunction,
	V2_MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import invariant from 'tiny-invariant'
import {
	getAppPageRoute,
	getApps,
	getExercise,
	getWorkshopTitle,
	isExerciseStepApp,
} from '~/utils/apps.server'
import { type loader as rootLoader } from '~/root'
import Loading from '~/components/loading'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '~/utils/timing.server'
import { NavChevrons } from '~/components/nav-chevrons'

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ data, matches }) => {
	if (!data) {
		return [{ title: '🦉 | Error' }]
	}
	const number = data.exercise.exerciseNumber.toString().padStart(2, '0')
	const rootData = matches.find(m => m.id === 'root')?.data
	return [
		{
			title: `🦉 | ${number}. ${data.exercise.title} | ${rootData?.workshopTitle}`,
		},
	]
}

export async function loader({ params, request }: DataFunctionArgs) {
	const timings = makeTimings('exerciseFeedbackLoader')
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber, {
		timings,
		request,
	})
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}
	const workshopTitle = await getWorkshopTitle()
	const nextExercise = await getExercise(exercise.exerciseNumber + 1, {
		timings,
		request,
	})

	const apps = await getApps({ request, timings })
	const exerciseApps = apps
		.filter(isExerciseStepApp)
		.filter(app => app.exerciseNumber === exercise.exerciseNumber)
	const prevApp = exerciseApps[exerciseApps.length - 1]

	return json(
		{
			workshopTitle,
			exercise,
			prevStepLink: prevApp
				? {
						to: getAppPageRoute(prevApp),
						'aria-label': `${prevApp.title} (${prevApp.type})`,
				  }
				: null,
			nextStepLink: nextExercise
				? {
						to: `/${nextExercise.exerciseNumber.toString().padStart(2, '0')}`,
						'aria-label': `${nextExercise.title}`,
				  }
				: {
						to: '/finished',
						'aria-label': 'Finished! 🎉',
				  },
		},
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
				'Cache-Control': 'public, max-age=300',
			},
		},
	)
}

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
	const headers = {
		'Cache-Control': loaderHeaders.get('Cache-Control') ?? '',
		'Server-Timing': combineServerTimings(loaderHeaders, parentHeaders),
	}
	return headers
}

export default function ExerciseFeedback() {
	const data = useLoaderData<typeof loader>()
	const searchParams = new URLSearchParams([
		['embedded', 'true'],
		['entry.1836176234', data.workshopTitle],
		['entry.428900931', data.exercise.title],
	])
	return (
		<main className="flex h-screen w-full flex-col">
			<div className="grid w-full flex-grow grid-cols-2 overflow-y-auto">
				<div className="flex flex-grow flex-col border-r border-t border-gray-200">
					<h4 className="border-b border-gray-200 py-8 pl-[58px] font-mono text-sm font-medium uppercase leading-tight">
						{`${data.exercise.exerciseNumber.toString().padStart(2, '0')}. ${
							data.exercise.title
						} `}{' '}
						| Feedback
					</h4>
					<iframe
						className="flex-grow pt-4"
						title="Feedback"
						src={`https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?${searchParams.toString()}`}
					>
						<Loading />
					</iframe>
					<div className="flex h-16 justify-end border-t border-gray-200 bg-white">
						<NavChevrons prev={data.prevStepLink} next={data.nextStepLink} />
					</div>
				</div>
				<div></div>
			</div>
		</main>
	)
}
