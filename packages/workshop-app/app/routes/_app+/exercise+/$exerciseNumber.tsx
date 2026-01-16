import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getExercises,
	getWorkshopRoot,
} from '@epic-web/workshop-utils/apps.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import { getEpicVideoInfos } from '@epic-web/workshop-utils/epic-api.server'
import {
	combineServerTimings,
	getServerTimeHeader,
	makeTimings,
	time,
} from '@epic-web/workshop-utils/timing.server'
import slugify from '@sindresorhus/slugify'
import { data, type HeadersFunction, Link } from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { ProgressToggle } from '#app/routes/progress.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'
import { type Route } from './+types/$exerciseNumber.tsx'
import { getExercise404Data } from './__shared/error-boundary.server.ts'
import { Exercise404ErrorBoundary } from './__shared/error-boundary.tsx'

export const meta: Route.MetaFunction = ({ loaderData, matches }) => {
	const number = loaderData?.exercise.exerciseNumber.toString().padStart(2, '0')

	const rootData = getRootMatchLoaderData(matches)
	if (!loaderData || !rootData) return [{ title: '🦉 | Error' }]

	return getSeoMetaTags({
		title: `📝 | ${number}. ${loaderData.exercise.title} | ${rootData?.workshopTitle}`,
		description: `Introduction for ${number}. ${loaderData.exercise.title}`,
		ogTitle: loaderData.exercise.title,
		ogDescription: `Introduction for exercise ${Number(number)}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const timings = makeTimings('exerciseNumberLoader')
	invariantResponse(params.exerciseNumber, 'exerciseNumber is required')
	const { title: workshopTitle } = getWorkshopConfig()
	const exercises = await time(() => getExercises({ request, timings }), {
		timings,
		type: 'getExercises',
		desc: 'getExercises in $exerciseNumber.tsx',
	})
	const exercise = exercises.find(
		(e) => e.exerciseNumber === Number(params.exerciseNumber),
	)
	if (!exercise) {
		throw Response.json(getExercise404Data({ exercises }), { status: 404 })
	}

	const readmeFilepath = path.join(
		getWorkshopRoot(),
		'exercises',
		exercise.dirName,
		'README.mdx',
	)

	const firstStep = exercise.steps.find(Boolean)

	const articleId = `workshop-${slugify(workshopTitle)}-${
		exercise.exerciseNumber
	}-instructions`

	return data(
		{
			articleId,
			exercise,
			exerciseNumber: exercise.exerciseNumber,
			exerciseReadme: {
				file: readmeFilepath,
				relativePath: `exercises/${exercise.dirName}/README.mdx`,
			},
			exerciseTitle: exercise.title,
			firstStep,
			firstType: firstStep?.problem ? 'problem' : 'solution',
			title: workshopTitle,
			epicVideoInfosPromise: getEpicVideoInfos(
				exercise.instructionsEpicVideoEmbeds,
				{ request },
			),
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

// we'll render the title ourselves thank you
const mdxComponents = { h1: () => null }

export default function ExerciseNumberRoute({
	loaderData: data,
}: Route.ComponentProps) {
	useRevalidationWS({
		watchPaths: [data.exerciseReadme.file],
	})

	const firstStepNumber = String(data.firstStep?.stepNumber ?? '01').padStart(
		2,
		'0',
	)
	return (
		<main className="relative flex h-full w-full max-w-5xl flex-col justify-between border-r md:w-3/4 xl:w-2/3">
			<article
				id={data.articleId}
				key={data.articleId}
				className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar flex w-full flex-1 flex-col gap-12 overflow-y-scroll px-3 py-4 pt-6 md:px-10 md:py-12 md:pt-16"
			>
				<div>
					<h1 className="text-[clamp(3rem,6vw,7.5rem)] leading-none font-extrabold">
						{data.exercise.title}
					</h1>
				</div>
				<div>
					{data.exercise.instructionsCode ? (
						<EpicVideoInfoProvider
							epicVideoInfosPromise={data.epicVideoInfosPromise}
						>
							<div className="prose dark:prose-invert sm:prose-lg">
								<Mdx
									code={data.exercise.instructionsCode}
									components={mdxComponents}
								/>
							</div>
						</EpicVideoInfoProvider>
					) : (
						'No instructions yet...'
					)}
				</div>
			</article>
			<ElementScrollRestoration
				elementQuery={`#${data.articleId}`}
				key={`scroll-${data.articleId}`}
			/>
			<ProgressToggle
				type="instructions"
				exerciseNumber={data.exerciseNumber}
				className="h-14 border-t px-6"
			/>
			<div className="@container flex h-16 justify-between border-t border-b-4 lg:border-b-0">
				<div />
				<EditFileOnGitHub
					file={data.exerciseReadme.file}
					relativePath={data.exerciseReadme.relativePath}
				/>
				<Link
					to={`${firstStepNumber}/${data.firstType}`}
					prefetch="intent"
					className="bg-foreground text-background flex h-full items-center justify-center px-7"
					data-keyboard-action="g+n"
				>
					Start Learning
				</Link>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			className="container flex items-center justify-center"
			statusHandlers={{
				404: Exercise404ErrorBoundary,
			}}
		/>
	)
}
