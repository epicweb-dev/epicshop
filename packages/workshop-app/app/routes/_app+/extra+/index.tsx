import { ElementScrollRestoration } from '@epic-web/restore-scroll'
import {
	getApps,
	getExtrasInstructions,
	isExtraApp,
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
		description: `Extras for ${rootData.workshopTitle}`,
		ogTitle: loaderData.title,
		ogDescription: `Extras for ${rootData.workshopTitle}`,
		instructor: rootData.instructor,
		requestInfo: rootData.requestInfo,
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('extrasIndexLoader')
	const { title: workshopTitle } = getWorkshopConfig()
	const [extrasReadme, apps] = await Promise.all([
		time(() => getExtrasInstructions({ request }), {
			timings,
			type: 'compileMdx',
			desc: 'compileMdx in extras index',
		}),
		time(() => getApps({ request, timings }), {
			timings,
			type: 'getApps',
			desc: 'getApps in extras index',
		}),
	])

	const extras = apps
		.filter(isExtraApp)
		.sort((a, b) =>
			a.title.localeCompare(b.title, undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		)
		.map((extra) => ({
			dirName: extra.dirName,
			title: extra.title,
		}))

	const title =
		extrasReadme.compiled.status === 'success'
			? (extrasReadme.compiled.title ?? 'Extras')
			: 'Extras'

	return data(
		{
			articleId: `workshop-${slugify(workshopTitle)}-extras`,
			title,
			extras,
			extrasReadme,
			epicVideoInfosPromise:
				extrasReadme.compiled.status === 'success'
					? getEpicVideoInfos(extrasReadme.compiled.epicVideoEmbeds, {
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

function ExtraListItem({
	extra,
}: {
	extra: { dirName: string; title: string }
}) {
	return (
		<li>
			<Link
				className={cn(
					'relative flex items-center gap-4 px-4 py-3 text-lg font-semibold transition',
					'hover:bg-muted/60 focus:bg-muted/60',
				)}
				prefetch="intent"
				to={extra.dirName}
			>
				<span className="text-muted-foreground text-xs font-normal tabular-nums">
					•
				</span>
				<span className="truncate">{extra.title}</span>
			</Link>
		</li>
	)
}

const mdxComponents = { h1: () => null }

export default function ExtrasIndex() {
	const data = useLoaderData<typeof loader>()
	useRevalidationWS({ watchPaths: ['./extra', './example', './examples'] })

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
					{data.extrasReadme.compiled.status === 'success' &&
					data.extrasReadme.compiled.code ? (
						<EpicVideoInfoProvider
							epicVideoInfosPromise={data.epicVideoInfosPromise}
						>
							<div className="prose dark:prose-invert sm:prose-lg">
								<Mdx
									code={data.extrasReadme.compiled.code}
									components={mdxComponents}
								/>
							</div>
						</EpicVideoInfoProvider>
					) : data.extrasReadme.compiled.status === 'error' ? (
						<div className="text-foreground-destructive">
							There was an error:
							<pre>{data.extrasReadme.compiled.error}</pre>
						</div>
					) : (
						'No extras overview yet...'
					)}
				</div>
				<div className="pt-6">
					<h2 className="pb-4 font-mono text-xs font-semibold uppercase">
						Extras
					</h2>
					{data.extras.length ? (
						<ul className="divide-border dark:divide-border/50 flex flex-col divide-y">
							{data.extras.map((extra) => (
								<ExtraListItem key={extra.dirName} extra={extra} />
							))}
						</ul>
					) : (
						<p className="text-muted-foreground">
							No extras yet. Add one to get started.
						</p>
					)}
				</div>
			</article>
			<ElementScrollRestoration elementQuery={`#${data.articleId}`} />
			<div className="@container flex h-16 justify-center border-t">
				<EditFileOnGitHub
					file={data.extrasReadme.file}
					relativePath={data.extrasReadme.relativePath}
				/>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
