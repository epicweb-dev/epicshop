import * as cookie from 'cookie'

const splitCookieName = 'es_split_pct'

export function computeSplitPercent(input: unknown, defaultValue = 50): number {
	const value = typeof input === 'number' ? input : Number(input)
	if (Number.isFinite(value)) {
		return Math.min(80, Math.max(20, Math.round(value * 100) / 100))
	}
	return defaultValue
}

export function getSplitPercentFromRequest(
	request: Request,
	defaultValue = 50,
) {
	const cookieHeader = request.headers.get('cookie')
	const rawSplit = cookieHeader
		? cookie.parse(cookieHeader)[splitCookieName]
		: null
	return computeSplitPercent(rawSplit, defaultValue)
}

export function setSplitPercentCookie(percent: number) {
	const clamped = computeSplitPercent(percent)
	document.cookie = `${splitCookieName}=${clamped}; path=/; SameSite=Lax;`
	return clamped
}

export function startSplitDrag({
	container,
	initialClientX,
	setSplitPercent,
}: {
	container: HTMLDivElement | null
	initialClientX: number
	setSplitPercent: (value: number) => void
}) {
	if (!container) return
	const rect = container.getBoundingClientRect()
	let dragging = true

	// Disable pointer events on iframes so the drag keeps receiving events.
	const iframes = Array.from(
		document.querySelectorAll('iframe'),
	) as HTMLIFrameElement[]
	const originalPointerEvents = iframes.map((el) => el.style.pointerEvents)
	iframes.forEach((el) => (el.style.pointerEvents = 'none'))

	function cleanup() {
		if (!dragging) return
		dragging = false
		iframes.forEach(
			(el, index) =>
				(el.style.pointerEvents = originalPointerEvents[index] ?? ''),
		)
		window.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('mouseup', cleanup)
		window.removeEventListener('touchmove', onTouchMove)
		window.removeEventListener('touchend', cleanup)
		document.body.style.cursor = ''
		document.body.style.userSelect = ''
	}

	function handleMove(clientX: number) {
		if (!dragging) {
			cleanup()
			return
		}

		const relativeX = clientX - rect.left
		const percent = (relativeX / rect.width) * 100
		const clamped = setSplitPercentCookie(percent)
		setSplitPercent(clamped)
	}

	function onMouseMove(event: MouseEvent) {
		if (!dragging || event.buttons === 0) {
			cleanup()
			return
		}
		handleMove(event.clientX)
	}

	function onTouchMove(event: TouchEvent) {
		const firstTouch = event.touches?.[0]
		if (!dragging || !firstTouch) {
			cleanup()
			return
		}
		handleMove(firstTouch.clientX)
	}

	window.addEventListener('mousemove', onMouseMove)
	window.addEventListener('mouseup', cleanup)
	window.addEventListener('touchmove', onTouchMove)
	window.addEventListener('touchend', cleanup)
	document.body.style.cursor = 'col-resize'
	document.body.style.userSelect = 'none'
	handleMove(initialClientX)
}
