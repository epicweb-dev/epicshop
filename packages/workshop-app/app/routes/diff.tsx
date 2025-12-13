import {
	getAppByName,
	getAppDisplayName,
	getApps,
	isExerciseStepApp,
} from '@epic-web/workshop-utils/apps.server'
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import { userHasAccessToWorkshop } from '@epic-web/workshop-utils/epic-api.server'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import {
	type LoaderFunctionArgs,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from 'react-router'
import { useSpinDelay } from 'spin-delay'
import { Diff } from '#app/components/diff.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { cn } from '#app/utils/misc.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	const reqUrl = new URL(request.url)
	const searchParams = reqUrl.searchParams
	const timings = makeTimings('diffLoader')
	const cacheOptions = { request, timings }
	const allAppsFull = await getApps()
	const app1Name = reqUrl.searchParams.get('app1')
	const app2Name = reqUrl.searchParams.get('app2')

	const usingDefaultApp1 = !app1Name

	// defaults to first problem app
	const app1 = app1Name
		? await getAppByName(app1Name)
		: allAppsFull.filter(isExerciseStepApp).at(0)

	// defaults to last exercise step app
	const app2 = app2Name
		? await getAppByName(app2Name)
		: allAppsFull.filter(isExerciseStepApp).at(-1)

	async function getDiffProp() {
		if (!app1 || !app2) {
			return {
				app1: app1?.name,
				app2: app2?.name,
				diffCode: null,
			}
		}
		const diffCode = await getDiffCode(app1, app2, {
			...cacheOptions,
			forceFresh: searchParams.get('forceFresh') === 'diff',
		}).catch((e) => {
			console.error(e)
			return null
		})
		return {
			app1: app1.name,
			app2: app2.name,
			diffCode,
		}
	}

	const allApps = allAppsFull
		.filter((a, i, ar) => ar.findIndex((b) => a.name === b.name) === i)
		.map((a) => ({
			displayName: getAppDisplayName(a, allAppsFull),
			name: a.name,
			title: a.title,
			type: a.type,
		}))

	const diff = getDiffProp()
	const app1Index = allApps.findIndex((a) => a.name === app1?.name)
	const prevApp1Index = usingDefaultApp1
		? allApps.length - 2
		: app1Index === 0
			? -2
			: app1Index - 1
	const prevApp2Index = prevApp1Index + 1
	const nextApp1Index = usingDefaultApp1
		? 0
		: app1Index + 1 < allApps.length
			? app1Index + 1
			: -2
	const nextApp2Index = nextApp1Index + 1
	const prevApp1 = allAppsFull[prevApp1Index]?.name
	const prevApp2 = allAppsFull[prevApp2Index]?.name
	const nextApp1 = allAppsFull[nextApp1Index]?.name
	const nextApp2 = allAppsFull[nextApp2Index]?.name
	const prevSearchParams = new URLSearchParams(reqUrl.searchParams)
	prevSearchParams.set('app1', prevApp1 ?? '')
	prevSearchParams.set('app2', prevApp2 ?? '')
	const nextSearchParams = new URLSearchParams(reqUrl.searchParams)
	nextSearchParams.set('app1', nextApp1 ?? '')
	nextSearchParams.set('app2', nextApp2 ?? '')
	return {
		userHasAccessPromise: userHasAccessToWorkshop({ request, timings }),
		allApps,
		diff,
		prevLink:
			prevApp1 && prevApp2
				? { to: `/diff?${prevSearchParams}`, 'aria-label': 'Previous App' }
				: { to: '/diff' },
		nextLink:
			nextApp1 && nextApp2
				? { to: `/diff?${nextSearchParams}`, 'aria-label': 'Next App' }
				: { to: '/diff' },
	}
}

export default function DiffViewer() {
	const data = useLoaderData<typeof loader>()
	const [params] = useSearchParams()
	const paramsWithForcedRefresh = new URLSearchParams(params)
	paramsWithForcedRefresh.set('forceFresh', 'diff')
	const navigation = useNavigation()
	const isNavigating = useSpinDelay(navigation.state !== 'idle', {
		delay: 200,
		minDuration: 200,
	})

	return (
		<div
			className={cn('h-screen-safe relative', {
				'cursor-wait opacity-30': isNavigating,
			})}
		>
			<div className="h-full pb-16">
				<Diff
					diff={data.diff}
					allApps={data.allApps}
					userHasAccessPromise={data.userHasAccessPromise}
				/>
			</div>
			<div className="bg-background fixed inset-x-0 bottom-0 z-10 flex h-16 items-center justify-end border-t">
				<div className="flex h-full items-center justify-end">
					<NavChevrons prev={data.prevLink} next={data.nextLink} />
				</div>
			</div>
		</div>
	)
}
