import { MediaChromeMenu } from 'media-chrome/menu'

type MediaChromeMenuWithTemplate = typeof MediaChromeMenu & {
	getTemplateHTML?: (attrs: Record<string, string>) => string
}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

function ensureLayoutRow(shadowRoot: ShadowRoot) {
	if (shadowRoot.querySelector('#layout-row')) return
	const templateHTML = (MediaChromeMenu as MediaChromeMenuWithTemplate)
		.getTemplateHTML?.({})

	if (templateHTML) {
		const template = document.createElement('template')
		template.innerHTML = templateHTML
		const layoutRowStyle = template.content.querySelector('#layout-row')
		if (layoutRowStyle) {
			shadowRoot.append(layoutRowStyle.cloneNode(true))
			return
		}
	}

	const layoutRowStyle = document.createElement('style')
	layoutRowStyle.id = 'layout-row'
	shadowRoot.append(layoutRowStyle)
}

function ensureHeaderSlot(shadowRoot: ShadowRoot) {
	const container = shadowRoot.querySelector('#container')
	if (!container) return
	const headerSlot = container.querySelector('slot[name="header"]')
	if (headerSlot) return

	const slot = document.createElement('slot')
	slot.name = 'header'
	slot.hidden = true
	container.prepend(slot)
}

if (isBrowser) {
	const prototype = MediaChromeMenu.prototype as typeof MediaChromeMenu.prototype & {
		__epicshopMenuGuard?: boolean
	}

	if (!prototype.__epicshopMenuGuard) {
		prototype.__epicshopMenuGuard = true
		const originalConnectedCallback = prototype.connectedCallback

		prototype.connectedCallback = function connectedCallback(...args) {
			const shadowRoot = this.shadowRoot
			if (shadowRoot) {
				ensureLayoutRow(shadowRoot)
				ensureHeaderSlot(shadowRoot)
			}

			return originalConnectedCallback?.apply(this, args)
		}
	}
}
