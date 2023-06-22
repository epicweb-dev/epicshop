import type { HeadersFunction, V2_MetaFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { getWorkshopTitle } from '~/utils/apps.server.ts'

import { ButtonLink } from '~/components/button.tsx'
import Loading from '~/components/loading.tsx'
import { type loader as rootLoader } from '~/root.tsx'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
} from '~/utils/timing.server.ts'

export const meta: V2_MetaFunction<
	typeof loader,
	{ root: typeof rootLoader }
> = ({ matches }) => {
	const rootData = matches.find(m => m.id === 'root')?.data
	return [{ title: `🎉 ${rootData?.workshopTitle}` }]
}

export async function loader() {
	const timings = makeTimings('finishedLoader')
	return json(
		{ workshopTitle: await getWorkshopTitle() },
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
		<main className="flex h-screen w-full flex-col">
			<div className="grid w-full flex-grow grid-cols-2 overflow-y-auto">
				<div className="border-border flex flex-grow flex-col border-r border-t">
					<h4 className="border-border border-b py-8 pl-[58px] font-mono text-sm font-medium uppercase leading-tight">
						{`${data.workshopTitle} | Finished`}
					</h4>
					<iframe
						className="flex-grow bg-white pt-4"
						title="Elaboration"
						src={`https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?${searchParams.toString()}`}
					>
						<Loading />
					</iframe>
					<div className="border-border flex h-16 justify-end border-t">
						<ButtonLink varient="primary" prefetch="intent" to="/">
							Home
						</ButtonLink>
					</div>
				</div>
				<div></div>
			</div>
		</main>
	)
}
