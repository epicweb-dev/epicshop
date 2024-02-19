import {
	type App,
	getAppByName,
	getApps,
	isExerciseStepApp,
	isPlaygroundApp,
} from '@kentcdodds/workshop-utils/apps.server'
import { makeTimings } from '@kentcdodds/workshop-utils/timing.server'
import { defer, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from '@remix-run/react'
import { useSpinDelay } from 'spin-delay'
import { Diff } from '#app/components/diff.tsx'
import { Icon } from '#app/components/icons.tsx'
import { NavChevrons } from '#app/components/nav-chevrons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { getDiffCode } from '#app/utils/diff.server.ts'
import { cn } from '#app/utils/misc.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	const reqUrl = new URL(request.url)
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
		const diffCode = await getDiffCode(app1, app2, cacheOptions).catch(e => {
			console.error(e)
			return null
		})
		return {
			app1: app1.name,
			app2: app2.name,
			diffCode,
		}
	}

	function getDisplayName(a: App) {
		let displayName = `${a.title} (${a.type})`
		if (isExerciseStepApp(a)) {
			displayName = `${a.exerciseNumber}.${a.stepNumber} ${a.title} (${
				{ problem: '💪', solution: '🏁' }[a.type]
			} ${a.type})`
		} else if (isPlaygroundApp(a)) {
			const playgroundAppBasis = allAppsFull.find(
				otherApp => a.appName === otherApp.name,
			)
			if (playgroundAppBasis) {
				const basisDisplayName = getDisplayName(playgroundAppBasis)
				displayName = `🛝 Playground: ${basisDisplayName}`
			} else {
				displayName = `🛝 Playground: ${a.appName}`
			}
		}
		return displayName
	}

	const allApps = allAppsFull
		.filter((a, i, ar) => ar.findIndex(b => a.name === b.name) === i)
		.map(a => ({
			displayName: getDisplayName(a),
			name: a.name,
			title: a.title,
			type: a.type,
		}))

	const diff = getDiffProp()
	const app1Index = allApps.findIndex(a => a.name === app1?.name)
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
	return defer({
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
	})
}

export default function DiffViewer() {
	const data = useLoaderData<typeof loader>()
	const [params] = useSearchParams()
	const navigation = useNavigation()
	const isNavigating = useSpinDelay(navigation.state !== 'idle', {
		delay: 200,
		minDuration: 200,
	})

	// when the user clicks the refresh button, we want to show it spinning
	const spinnerNavigating = useSpinDelay(navigation.state !== 'idle', {
		delay: 0,
		minDuration: 1000,
	})
	return (
		<div
			className={cn('grid h-full grid-rows-[1fr,auto]', {
				'cursor-wait opacity-30': isNavigating,
			})}
		>
			<div className="overflow-y-auto">
				<Diff diff={data.diff} allApps={data.allApps} />
			</div>
			<div className="flex h-16 items-center justify-end border-t">
				<SimpleTooltip content="Reload diff">
					<Link
						to={`.?${params}`}
						className="flex h-full w-16 items-center justify-center"
					>
						<Icon
							name="Refresh"
							className={cn({ 'animate-spin': spinnerNavigating })}
						/>
					</Link>
				</SimpleTooltip>
				<NavChevrons prev={data.prevLink} next={data.nextLink} />
			</div>
		</div>
	)
}
