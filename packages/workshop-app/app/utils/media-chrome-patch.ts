import 'media-chrome'

const patchKey = '__epicshop_media_chrome_range_patch__'

type MediaChromeRangePrototype = {
	updateSegments?: (segments: unknown) => void
	__epicshopUpdateSegmentsGuard?: boolean
}

function scheduleTask(task: () => void) {
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(() => task())
		return
	}
	setTimeout(task, 0)
}

function patchMediaChromeRange() {
	if (typeof window === 'undefined' || !window.customElements) return
	const registry = window as Record<string, boolean | undefined>
	if (registry[patchKey]) return
	registry[patchKey] = true

	const applyPatch = () => {
		const MediaChromeRange = window.customElements.get(
			'media-chrome-range',
		) as (HTMLElement & { prototype?: MediaChromeRangePrototype }) | undefined
		const proto = MediaChromeRange?.prototype
		if (!proto || proto.__epicshopUpdateSegmentsGuard) return
		if (typeof proto.updateSegments !== 'function') return

		const originalUpdateSegments = proto.updateSegments
		proto.updateSegments = function updateSegmentsWithGuard(
			this: HTMLElement & { shadowRoot?: ShadowRoot | null },
			segments: unknown,
		) {
			const clipping = this.shadowRoot?.querySelector?.('#segments-clipping')
			if (!clipping) {
				scheduleTask(() => {
					if (!this.isConnected) return
					const retryClipping =
						this.shadowRoot?.querySelector?.('#segments-clipping')
					if (!retryClipping) return
					originalUpdateSegments.call(this, segments)
				})
				return
			}
			originalUpdateSegments.call(this, segments)
		}
		proto.__epicshopUpdateSegmentsGuard = true
	}

	void window.customElements.whenDefined('media-chrome-range').then(applyPatch)
}

export function attachMediaChromeRangeGuards() {
	patchMediaChromeRange()
}
