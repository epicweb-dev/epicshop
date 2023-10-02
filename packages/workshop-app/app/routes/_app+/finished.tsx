import type {
	DataFunctionArgs,
	HeadersFunction,
	MetaFunction,
} from '@remix-run/node'
import path from 'path'
import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Loading } from '~/components/loading.tsx'
import { NavChevrons } from '~/components/nav-chevrons.tsx'
import { type loader as rootLoader } from '~/root.tsx'
import { compileMdx } from '~/utils/compile-mdx.server.ts'
import {
	getExercises,
	getWorkshopRoot,
	getWorkshopTitle,
} from '~/utils/apps.server.ts'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '~/utils/timing.server.ts'
import { cn, getErrorMessage } from '~/utils/misc.tsx'
import * as React from 'react'
import { EditFileOnGitHub } from '../launch-editor.tsx'
import { Mdx } from '~/utils/mdx.tsx'

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	matches,
}) => {
	const rootData = matches.find(m => m.id === 'root')?.data
	return [{ title: `🎉 ${rootData?.workshopTitle}` }]
}

export async function loader({ request }: DataFunctionArgs) {
	const timings = makeTimings('finishedLoader')
	const exercises = await getExercises({ request, timings })
	const workshopRoot = getWorkshopRoot()
	const compiledFinished = await time(
		async () => {
			const finishedFilepath = path.join(
				workshopRoot,
				'exercises',
				'FINISHED.mdx',
			)
			const compiled = await compileMdx(finishedFilepath).then(
				r => ({ ...r, status: 'success' }) as const,
				e => {
					console.error(
						`There was an error compiling the workshop finished.mdx`,
						finishedFilepath,
						e,
					)
					return { status: 'error', error: getErrorMessage(e) } as const
				},
			)
			return {
				compiled,
				file: finishedFilepath,
				relativePath: 'exercises/finished.mdx',
			}
		},
		{ timings, type: 'compileMdx', desc: 'compileMdx in finished' },
	)
	const lastExercises = exercises[exercises.length - 1]
	return json(
		{
			workshopTitle: await getWorkshopTitle(),
			finishedCode:
				compiledFinished.compiled.status === 'success'
					? compiledFinished.compiled.code
					: null,
			workshopFinished: {
				file: compiledFinished.file,
				relativePath: compiledFinished.relativePath,
			},
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
	return (
		<div className="flex flex-grow flex-col">
			<main className="grid h-full flex-grow grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
				<div className="relative col-span-1 row-span-1 flex h-full flex-col border-r border-border">
					<h1 className="h-14 border-b border-border pl-10 pr-5 text-sm font-medium uppercase leading-none">
						<div className="flex h-14 flex-wrap items-center justify-between gap-x-2 py-2">
							<div className="flex items-center justify-start gap-x-2">
								<Link to="/" className="hover:underline">
									{data.workshopTitle}
								</Link>
								<span>/</span>
								<span>Elaboration</span>
							</div>
						</div>
					</h1>

					<article
						className="shadow-on-scrollbox prose h-full w-full max-w-none flex-1 space-y-6 overflow-y-auto p-10 pt-8 scrollbar-thin scrollbar-thumb-scrollbar dark:prose-invert sm:prose-lg"
						data-restore-scroll="true"
					>
						{data.finishedCode ? (
							<Mdx code={data.finishedCode} components={{ h1: () => null }} />
						) : (
							// TODO: render a random dad joke...
							'No finished instructions yet...'
						)}
					</article>
					<div className="flex h-16 justify-between border-b-4 border-t border-border lg:border-b-0">
						<div />
						{data.workshopFinished ? (
							<EditFileOnGitHub
								file={data.workshopFinished.file}
								relativePath={data.workshopFinished.relativePath}
							/>
						) : null}
						<NavChevrons prev={data.prevStepLink} next={{ to: '/' }} />
					</div>
				</div>
				<Survey workshopTitle={data.workshopTitle} />
			</main>
		</div>
	)
}

function Survey({ workshopTitle }: { workshopTitle: string }) {
	const [iframeLoaded, setIframeLoaded] = React.useState(false)
	const searchParams = new URLSearchParams([
		['embedded', 'true'],
		['entry.2123647600', workshopTitle],
	])
	return (
		<div className="relative flex-shrink-0">
			{!iframeLoaded ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<Loading>
						<span>Loading {workshopTitle} Elaboration form</span>
					</Loading>
				</div>
			) : null}
			<iframe
				onLoad={() => setIframeLoaded(true)}
				title="Elaboration"
				src={`https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?${searchParams.toString()}&hl=en`}
				className={cn(
					'absolute inset-0 flex h-full w-full transition-opacity duration-300',
					iframeLoaded ? 'opacity-100' : 'opacity-0',
				)}
			/>
		</div>
	)
}
