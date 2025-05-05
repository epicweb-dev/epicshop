import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.js'
import { type loader as rootLoader } from '#app/root.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { ProgressToggle } from '#app/routes/progress.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { getErrorMessage } from '#app/utils/misc.tsx'
import { getSeoMetaTags } from '#app/utils/seo.js'
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
import path from 'path'
import {
	Link,
	data,
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
	type HeadersFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
} from 'react-router'

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	data,
	matches,
}) => {
	const number = data?.exercise.exerciseNumber.toString().padStart(2, '0')

	const rootData = matches.find((m) => m.id === 'root')?.data
	if (!data || !rootData) return [{ title: '🦉 | Error' }]

	return getSeoMetaTags({
		title: `📝 | ${number}. ${data.exercise.title} | ${rootData?.workshopTitle}`,
		description: `Introduction for ${number}. ${data.exercise.title}`,
		ogTitle: data.exercise.title,
		ogDescription: `Introduction for exercise ${Number(number)}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request, params }: LoaderFunctionArgs) {
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
		throw new Response('Not found', { status: 404 })
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
				relativePath: `exercises/${exercise.dirName}`,
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
		{ headers: { 'Server-Timing': getServerTimeHeader(timings) } },
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

export default function ExerciseNumberRoute() {
	const data = useLoaderData<typeof loader>()
	useRevalidationWS({ watchPaths: [data.exerciseReadme.file] })

	const firstStepNumber = String(data.firstStep?.stepNumber ?? '01').padStart(
		2,
		'0',
	)
	return (
		<main className="relative flex h-full w-full max-w-5xl flex-col justify-between border-r md:w-3/4 xl:w-2/3">
			<article
				id={data.articleId}
				key={data.articleId}
				className="shadow-on-scrollbox flex w-full flex-1 flex-col gap-12 overflow-y-scroll px-3 py-4 pt-6 scrollbar-thin scrollbar-thumb-scrollbar md:px-10 md:py-12 md:pt-16"
			>
				<div>
					<h1 className="text-[clamp(3rem,6vw,7.5rem)] font-extrabold leading-none">
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
			<div className="flex h-16 justify-between border-b-4 border-t lg:border-b-0">
				<div />
				<EditFileOnGitHub
					file={data.exerciseReadme.file}
					relativePath={data.exerciseReadme.relativePath}
				/>
				<Link
					to={`${firstStepNumber}/${data.firstType}`}
					prefetch="intent"
					className="flex h-full items-center justify-center bg-foreground px-7 text-background"
				>
					Start Learning
				</Link>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return isRouteErrorResponse(error) ? (
		error.status === 404 ? (
			<p>Sorry, we couldn't find that step.</p>
		) : (
			<p>
				{error.status} {error.data}
			</p>
		)
	) : (
		<p>{getErrorMessage(error)}</p>
	)
}
