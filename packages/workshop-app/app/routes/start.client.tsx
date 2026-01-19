'use client'

import { useFetcher } from 'react-router'
import { Button } from '#app/components/button.tsx'
import { Loading } from '#app/components/loading.tsx'
import { showProgressBarField } from '#app/components/progress-bar.tsx'
import { useAltDown } from '#app/utils/misc.client.tsx'
import { usePERedirectInput } from '#app/utils/pe.client.tsx'

type StartActionData =
	| { status: 'app-started' }
	| { status: 'app-stopped' }
	| { status: 'port-stopped' }
	| { status: 'app-not-started'; error: string; port: number }

export function AppStopper({ name }: { name: string }) {
	const fetcher = useFetcher<StartActionData>()
	const peRedirectInput = usePERedirectInput()
	const inFlightIntent = fetcher.formData?.get('intent')
	const inFlightState =
		inFlightIntent === 'stop'
			? 'Stopping App'
			: inFlightIntent === 'restart'
				? 'Restarting App'
				: null
	const altDown = useAltDown()
	return (
		<fetcher.Form method="POST" action="/start">
			{peRedirectInput}
			{showProgressBarField}
			<input type="hidden" name="name" value={name} />
			<button
				type="submit"
				name="intent"
				value={altDown ? 'restart' : 'stop'}
				className="h-full border-r px-3 py-4 font-mono text-xs leading-none uppercase"
			>
				{inFlightState ? inFlightState : altDown ? 'Restart App' : 'Stop App'}
			</button>
		</fetcher.Form>
	)
}

export function PortStopper({ port }: { port: number | string }) {
	const fetcher = useFetcher<StartActionData>()
	const peRedirectInput = usePERedirectInput()
	return (
		<fetcher.Form method="POST" action="/start">
			{peRedirectInput}
			{showProgressBarField}
			<input type="hidden" name="port" value={port} />
			<Button varient="mono" type="submit" name="intent" value="stop-port">
				{fetcher.state === 'idle' ? 'Stop Port' : 'Stopping Port'}
			</Button>
		</fetcher.Form>
	)
}

export function AppStarter({ name }: { name: string }) {
	const fetcher = useFetcher<StartActionData>()
	const peRedirectInput = usePERedirectInput()
	if (fetcher.data?.status === 'app-not-started') {
		if (fetcher.data.error === 'port-unavailable') {
			return (
				<div>
					The port is unavailable. Would you like to stop whatever is running on
					that port and try again?
					<PortStopper port={fetcher.data.port} />
				</div>
			)
		} else {
			return <div>An unknown error has happened.</div>
		}
	}
	return (
		<fetcher.Form method="POST" action="/start">
			{peRedirectInput}
			{showProgressBarField}
			<input type="hidden" name="name" value={name} />
			{fetcher.state === 'idle' ? (
				<Button type="submit" name="intent" value="start" varient="mono">
					Start App
				</Button>
			) : (
				<div>
					<Loading>Starting App</Loading>
				</div>
			)}
		</fetcher.Form>
	)
}
