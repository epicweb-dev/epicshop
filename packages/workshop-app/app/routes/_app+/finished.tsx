import type {
	DataFunctionArgs,
	HeadersFunction,
	MetaFunction,
} from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { Loading } from '~/components/loading.tsx'
import { NavChevrons } from '~/components/nav-chevrons.tsx'
import { type loader as rootLoader } from '~/root.tsx'
import { getExercises, getWorkshopTitle } from '~/utils/apps.server.ts'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '~/utils/timing.server.ts'

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	matches,
}) => {
	const rootData = matches.find(m => m.id === 'root')?.data
	return [{ title: `🎉 ${rootData?.workshopTitle}` }]
}

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('finishedLoader')
	const exercises = await getExercises({ request, timings })
	const lastExercises = exercises[exercises.length - 1]
	return json(
		{
			workshopTitle: await getWorkshopTitle(),
			prevStepLink: lastExercises
				? {
						to: `/${lastExercises.exerciseNumber}/finished`,
				  }
				: null,
		},
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
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

export default function ExerciseFinished() {
	const data = useLoaderData<typeof loader>()
	const searchParams = new URLSearchParams([
		['embedded', 'true'],
		['entry.2123647600', data.workshopTitle],
	])
	return (
		<main className="flex w-full flex-col">
			<div className="grid w-full flex-grow grid-cols-2 overflow-y-auto">
				<div className="flex flex-grow flex-col border-r border-border">
					<h4 className="border-b border-border py-[20.5px] pl-[58px] font-mono text-sm font-medium uppercase leading-none">
						{`${data.workshopTitle} | Finished`}
					</h4>
					<iframe
						className="flex-grow bg-white pt-4"
						title="Elaboration"
						src={`https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?${searchParams.toString()}&hl=en`}
					>
						<Loading />
					</iframe>
					<div className="flex h-[52px] justify-end border-t border-border">
						<NavChevrons
							prev={
								data.prevStepLink
									? {
											to: data.prevStepLink.to,
											'aria-label': 'Previous Step',
									  }
									: null
							}
							next={{ to: '/', 'aria-label': 'Home' }}
						/>
					</div>
				</div>
				<div></div>
			</div>
		</main>
	)
}
