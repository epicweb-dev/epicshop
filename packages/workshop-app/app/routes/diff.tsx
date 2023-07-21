import { json, type DataFunctionArgs } from '@remix-run/node'
import {
	Link,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from '@remix-run/react'
import { useSpinDelay } from 'spin-delay'
import { Diff } from '~/components/diff.tsx'
import { Icon } from '~/components/icons.tsx'
import { NavChevrons } from '~/components/nav-chevrons.tsx'
import type { App } from '~/utils/apps.server.ts'
import {
	getAppByName,
	getApps,
	isExerciseStepApp,
	isPlaygroundApp,
} from '~/utils/apps.server.ts'
import { getDiffCode } from '~/utils/diff.server.ts'
import { cn } from '~/utils/misc.tsx'
import { makeTimings } from '~/utils/timing.server.ts'

export async function loader({ request }: DataFunctionArgs) {
	const reqUrl = new URL(request.url)
	const timings = makeTimings('diffLoader')
	const cacheOptions = { request, timings }
	const allAppsFull = await getApps()
	const app1Name = reqUrl.searchParams.get('app1')
	const app2Name = reqUrl.searchParams.get('app2')

	// defaults to first problem app
	const app1 = app1Name
		? await getAppByName(app1Name)
		: allAppsFull.find(a => a.type === 'problem')

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

	// TODO: figure out why this has to have `await` in front of it.
	const diff = await getDiffProp()
	const app1Index = allApps.findIndex(a => a.name === app1?.name)
	const prevApp = allApps[app1Index - 1]
	const nextApp = allApps[app1Index + 2]
	const prevSearchParams = new URLSearchParams(reqUrl.searchParams)
	prevSearchParams.set('app1', prevApp?.name ?? '')
	prevSearchParams.set('app2', app1?.name ?? '')
	const nextSearchParams = new URLSearchParams(reqUrl.searchParams)
	nextSearchParams.set('app1', app2?.name ?? '')
	nextSearchParams.set('app2', nextApp?.name ?? '')
	return json({
		allApps,
		diff,
		prevLink: prevApp
			? { to: `/diff?${prevSearchParams}`, 'aria-label': 'Previous App' }
			: null,
		nextLink: nextApp
			? { to: `/diff?${nextSearchParams}`, 'aria-label': 'Next App' }
			: null,
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
			className={cn('flex justify-between flex-col h-full', {
				'opacity-30 cursor-wait': isNavigating,
			})}
		>
			<Diff diff={data.diff} allApps={data.allApps} />
			<div className="border-border flex h-16 justify-end border-t items-center">
				<Link
					to={`.?${params}`}
					className="h-full w-16 flex justify-center items-center"
				>
					<Icon
						name="Refresh"
						className={cn({ 'animate-spin': spinnerNavigating })}
						title="Loading diff"
					/>
				</Link>
				<NavChevrons prev={data.prevLink} next={data.nextLink} />
			</div>
		</div>
	)
}
