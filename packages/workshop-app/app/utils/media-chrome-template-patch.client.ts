import { ChildNodePart } from 'media-chrome/dist/utils/template-parts.js'

const patchKey = '__epicshopMediaChromeChildNodePartPatched__'
type ChildNodePartInstance = {
	parentNode: Node | null
	replace: (...nodes: Array<unknown>) => void
}

const prototype = ChildNodePart.prototype as unknown as ChildNodePartInstance &
	Record<string, unknown>

if (!prototype[patchKey]) {
	const originalReplace = prototype.replace
	prototype.replace = function (...nodes: Array<unknown>) {
		const parent = this.parentNode
		if (!parent || !parent.isConnected) return
		originalReplace.call(this, ...nodes)
	}
	prototype[patchKey] = true
}
