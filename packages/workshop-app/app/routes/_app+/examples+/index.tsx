import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getApps,
	getExamplesInstructions,
	isExampleApp,
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
import {
	data,
	type HeadersFunction,
	Link,
	type LoaderFunctionArgs,
	type MetaFunction,
	useLoaderData,
} from 'react-router'
import { EpicVideoInfoProvider } from '#app/components/epic-video.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { useRevalidationWS } from '#app/components/revalidation-ws.tsx'
import { EditFileOnGitHub } from '#app/routes/launch-editor.tsx'
import { Mdx } from '#app/utils/mdx.tsx'
import { cn } from '#app/utils/misc.tsx'
import { getRootMatchLoaderData } from '#app/utils/root-loader.ts'
import { getSeoMetaTags } from '#app/utils/seo.ts'

export const meta: MetaFunction<typeof loader> = (args) => {
	const loaderData = args.data
	const rootData = getRootMatchLoaderData(args.matches)
	if (!loaderData || !rootData) return [{ title: '🦉 | Error' }]

	return getSeoMetaTags({
		title: `📚 | ${loaderData.title} | ${rootData.workshopTitle}`,
		description: `Examples for ${rootData.workshopTitle}`,
		ogTitle: loaderData.title,
		ogDescription: `Examples for ${rootData.workshopTitle}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('examplesIndexLoader')
	const { title: workshopTitle } = getWorkshopConfig()
	const [examplesReadme, apps] = await Promise.all([
		time(() => getExamplesInstructions({ request }), {
			timings,
			type: 'compileMdx',
			desc: 'compileMdx in examples index',
		}),
		time(() => getApps({ request, timings }), {
			timings,
			type: 'getApps',
			desc: 'getApps in examples index',
		}),
	])

	const examples = apps
		.filter(isExampleApp)
		.sort((a, b) =>
			a.title.localeCompare(b.title, undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		)
		.map((example) => ({
			dirName: example.dirName,
			title: example.title,
		}))

	const title =
		examplesReadme.compiled.status === 'success'
			? (examplesReadme.compiled.title ?? 'Examples')
			: 'Examples'

	return data(
		{
			articleId: `workshop-${slugify(workshopTitle)}-examples`,
			title,
			examples,
			examplesReadme,
			epicVideoInfosPromise:
				examplesReadme.compiled.status === 'success'
					? getEpicVideoInfos(examplesReadme.compiled.epicVideoEmbeds, {
							request,
						})
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

function ExampleListItem({
	example,
}: {
	example: { dirName: string; title: string }
}) {
	return (
		<li>
			<Link
				className={cn(
					'relative flex items-center gap-4 px-4 py-3 text-lg font-semibold transition',
					'hover:bg-muted/60 focus:bg-muted/60',
				)}
				prefetch="intent"
				to={example.dirName}
			>
				<span className="text-muted-foreground text-xs font-normal tabular-nums">
					•
				</span>
				<span className="truncate">{example.title}</span>
			</Link>
		</li>
	)
}

const mdxComponents = { h1: () => null }

export default function ExamplesIndex() {
	const data = useLoaderData<typeof loader>()
	useRevalidationWS({ watchPaths: ['./examples'] })

	return (
		<main className="relative flex h-full w-full max-w-5xl flex-col justify-between border-r md:w-3/4 xl:w-2/3">
			<article
				id={data.articleId}
				className="shadow-on-scrollbox scrollbar-thin scrollbar-thumb-scrollbar flex w-full flex-1 flex-col gap-12 overflow-y-scroll px-3 py-4 pt-6 md:px-10 md:py-12 md:pt-16"
			>
				<div>
					<h1 className="text-[clamp(3rem,6vw,7.5rem)] leading-none font-extrabold">
						{data.title}
					</h1>
				</div>
				<div>
					{data.examplesReadme.compiled.status === 'success' &&
					data.examplesReadme.compiled.code ? (
						<EpicVideoInfoProvider
							epicVideoInfosPromise={data.epicVideoInfosPromise}
						>
							<div className="prose dark:prose-invert sm:prose-lg">
								<Mdx
									code={data.examplesReadme.compiled.code}
									components={mdxComponents}
								/>
							</div>
						</EpicVideoInfoProvider>
					) : data.examplesReadme.compiled.status === 'error' ? (
						<div className="text-foreground-destructive">
							There was an error:
							<pre>{data.examplesReadme.compiled.error}</pre>
						</div>
					) : (
						'No examples overview yet...'
					)}
				</div>
				<div className="pt-6">
					<h2 className="pb-4 font-mono text-xs font-semibold uppercase">
						Examples
					</h2>
					{data.examples.length ? (
						<ul className="divide-border dark:divide-border/50 flex flex-col divide-y">
							{data.examples.map((example) => (
								<ExampleListItem key={example.dirName} example={example} />
							))}
						</ul>
					) : (
						<p className="text-muted-foreground">
							No examples yet. Add one to get started.
						</p>
					)}
				</div>
			</article>
			<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
			<div className="@container flex h-16 justify-center border-t">
				<EditFileOnGitHub
					file={data.examplesReadme.file}
					relativePath={data.examplesReadme.relativePath}
				/>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
