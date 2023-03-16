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
			if (type === 'kcdshop:refresh') {
				window.location.reload()
			}
		}
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [navigate])

	return null
}
