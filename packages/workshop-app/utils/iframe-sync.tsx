import { useNavigate } from '@remix-run/react'
import { useEffect } from 'react'

let effectSetup = false

export function KCDShopIFrameSync() {
	const navigate = useNavigate()

	// communicate with parent
	useEffect(() => {
		if (effectSetup) return
		effectSetup = true
		if (window.parent === window) return

		// @ts-expect-error - this is fine 🔥
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
	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			const { type, params } = event.data
			if (type === 'kcdshop:navigate-call') {
				// @ts-expect-error - this is fine too 🙃 promise 😅
				navigate(...params)
			}
		}
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [navigate])

	return (
		<script
			type="module"
			dangerouslySetInnerHTML={{ __html: iframeSyncScript }}
		/>
	)
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
