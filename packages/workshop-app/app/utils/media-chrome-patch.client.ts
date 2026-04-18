export function patchMediaChromeMenuItem() {
	if (typeof window === 'undefined') return
	if (!('customElements' in window)) return

	const patch = () => {
		const menuItem = window.customElements.get('media-chrome-menu-item')
		if (!menuItem) return

		const descriptor = Object.getOwnPropertyDescriptor(
			menuItem.prototype,
			'submenuElement',
		)
		if (!descriptor?.get) return
		if ((descriptor.get as { __epicshopPatched?: boolean }).__epicshopPatched) {
			return
		}

		const safeGetter = function (this: { shadowRoot?: ShadowRoot | null }) {
			try {
				const shadowRoot = this.shadowRoot
				if (!shadowRoot) return null
				const slot = shadowRoot.querySelector?.('slot[name="submenu"]')
				if (!slot || typeof slot.assignedElements !== 'function') return null
				const elements = slot.assignedElements({ flatten: true })
				return elements?.[0] ?? null
			} catch {
				return null
			}
		}

		;(safeGetter as { __epicshopPatched?: boolean }).__epicshopPatched = true

		Object.defineProperty(menuItem.prototype, 'submenuElement', {
			...descriptor,
			get: safeGetter,
		})
	}

	if (typeof window.customElements.whenDefined === 'function') {
		void window.customElements.whenDefined('media-chrome-menu-item').then(patch)
	} else {
		patch()
	}
}
