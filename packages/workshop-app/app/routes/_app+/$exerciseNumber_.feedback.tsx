import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { useEffect, useState } from 'react'
import invariant from 'tiny-invariant'
import { useDebounce, useLocalStorageState } from '~/utils/misc'
import {
	getAppPageRoute,
	getApps,
	getExercise,
	getWorkshopTitle,
	isExerciseStepApp,
} from '~/utils/misc.server'

export async function loader({ params }: DataFunctionArgs) {
	invariant(params.exerciseNumber, 'exerciseNumber is required')
	const exercise = await getExercise(params.exerciseNumber)
	if (!exercise) {
		throw new Response('Not found', { status: 404 })
	}
	const workshopTitle = await getWorkshopTitle()
	const nextExercise = await getExercise(exercise.exerciseNumber + 1)

	const apps = await getApps()
	const exerciseApps = apps
		.filter(isExerciseStepApp)
		.filter(app => app.exerciseNumber === exercise.exerciseNumber)
	const prevApp = exerciseApps[exerciseApps.length - 1]

	return json({
		workshopTitle,
		exercise,
		prevStepLink: prevApp
			? {
					to: getAppPageRoute(prevApp),
					children: `⬅️ ${prevApp.title} (${prevApp.type})`,
			  }
			: null,
		nextStepLink: nextExercise
			? {
					to: `/${nextExercise.exerciseNumber.toString().padStart(2, '0')}`,
					children: `${nextExercise.title} ➡️`,
			  }
			: {
					to: '/finished',
					children: 'Finished! 🎉',
			  },
	})
}

export default function ExerciseFeedback() {
	const data = useLoaderData<typeof loader>()
	const [email, setEmail] = useLocalStorageState('kcdshop-feedback-email', '')
	const handleChange = useDebounce(setEmail, 500)
	const searchParams = new URLSearchParams([
		['embedded', 'true'],
		['entry.1836176234', data.workshopTitle],
		['entry.428900931', data.exercise.title],
		['entry.1058834470', email],
	])
	const [hydrated, setHydrated] = useState(false)
	useEffect(() => {
		setHydrated(true)
	}, [])
	return (
		<div className="container mx-auto h-full">
			<h1>Submit feedback on this exercise</h1>
			<div className="flex flex-col">
				<label>Default Email (optional)</label>
				<input
					type="email"
					defaultValue={email}
					onChange={e => handleChange(e.currentTarget.value)}
					className="max-w-xs rounded border-2 border-sky-600"
				/>
				<small>
					This is used to prefill your email address in KCD workshop feedback
					forms like this one
				</small>
			</div>
			{hydrated ? (
				<iframe
					className="mx-auto h-full min-w-full max-w-2xl rounded-md border-2 border-gray-200"
					title="Feedback"
					src={`https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?${searchParams.toString()}`}
				>
					Loading…
				</iframe>
			) : null}
			<div className="flex justify-around">
				{data.prevStepLink ? (
					<Link
						prefetch="intent"
						className="text-blue-700 underline"
						to={data.prevStepLink.to}
						children={data.prevStepLink.children}
					/>
				) : null}
				{data.nextStepLink ? (
					<Link
						prefetch="intent"
						className="text-blue-700 underline"
						to={data.nextStepLink.to}
						children={data.nextStepLink.children}
					/>
				) : null}
			</div>
		</div>
	)
}
