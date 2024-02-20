/*
This file is kinda weird. KCDShop actually bundles react and react router to
avoid getting version clashes, but this component is used in the "host"
application. Anything we use in this file will be this file's version of that
dependency, which in the case of bundled dependencies would be different from
the host app's version. We want to avoid shipping two versions of React and
react-router to the client. So we need to accept React and navigate as props
rather than just using those things directly.

To reduce the annoyance, we'll have the host applications have a file like this:

// Ignore this file please
import { KCDShopIFrameSync } from '@kentcdodds/workshop-utils/iframe-sync'
import { useNavigate } from '@remix-run/react'
import * as React from 'react'

export function KCDShop() {
	const navigate = useNavigate()
	return <KCDShopIFrameSync React={React} navigate={navigate} />
}

 */
let effectSetup = false

type CustomReactType = {
	useEffect: (cb: () => (() => void) | void, deps: Array<any>) => void
	createElement: (type: string, props: any, ...children: Array<any>) => any
}

const iframeSyncScript = /* javascript */ `
if (window.parent !== window) {
	window.__kcdshop__ = window.__kcdshop__ || {};
	window.parent.postMessage(
		{ type: 'kcdshop:loaded', url: window.location.href },
		'*'
	);
	function handleMessage(event) {
		const { type, params } = event.data
		if (type === 'kcdshop:navigate-call') {
			const [distanceOrUrl, options] = params
			if (typeof distanceOrUrl === 'number') {
				window.history.go(distanceOrUrl)
			} else {
				if (options?.replace) {
					window.location.replace(distanceOrUrl)
				} else {
					window.location.assign(distanceOrUrl)
				}
			}
		}
	}

	window.addEventListener('message', handleMessage)
	window.__kcdshop__.onHydrated = function() {
		window.removeEventListener('message', handleMessage)
	};
}
`

export function KCDShopIFrameSync<ReactType extends CustomReactType>({
	React,
	navigate,
}: {
	React: ReactType
	navigate: (...args: Array<any>) => void
}) {
	// communicate with parent
	React.useEffect(() => {
		if (effectSetup) return
		effectSetup = true
		if (window.parent === window) return

		// @ts-expect-error - this is fine 🔥
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		window.__kcdshop__?.onHydrated?.()

		const methods = [
			'pushState',
			'replaceState',
			'go',
			'forward',
			'back',
		] as const
		for (const method of methods) {
			// @ts-expect-error - this is fine 🔥
			window.history[method] = new Proxy(window.history[method], {
				// eslint-disable-next-line no-loop-func
				apply(target, thisArg, argArray) {
					window.parent.postMessage(
						{ type: 'kcdshop:history-call', method, args: argArray },
						'*',
					)
					// @ts-expect-error - this is fine too 🙃
					return target.apply(thisArg, argArray)
				},
			})
		}
	}, [])

	// listen for messages from parent
	React.useEffect(() => {
		function handleMessage(event: MessageEvent) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const { type, params } = event.data
			if (type === 'kcdshop:navigate-call') {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				navigate(...params)
			}
		}
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [navigate])

	return React.createElement('script', {
		type: 'module',
		dangerouslySetInnerHTML: { __html: iframeSyncScript },
	})
}
