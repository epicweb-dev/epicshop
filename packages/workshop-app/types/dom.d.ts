declare global {
	// prettier-ignore
	type EventTargetElement = HTMLElement | Document | (Window & typeof globalThis) | null

	type ToastVariant = 'Error' | 'Notify' | 'Success' | 'action'

	type ToastEventProps = {
		title: string
		variant: ToastVariant
		visible?: boolean
		onDismiss?: () => void
	} & (
		| { content?: string; children?: never }
		| {
				children?:
					| string
					| React.ReactElement<any, string | React.JSXElementConstructor<any>>
				content?: never
		  }
	) &
		(
			| { autoClose: false; duration?: never }
			| { duration?: number; autoClose?: never }
		)

	/* extend this list when need to, see EventMap interfaces at lib.dom.d.ts */
	interface CustomEventMap {
		'kcdshop-toast-show': CustomEvent<ToastEventProps>
		'kcdshop-launch-editor-update': CustomEvent<string>
	}

	interface CustomEventListener<EVENT_TYPE>
		extends EventListenerOrEventListenerObject {
		(evt: CustomEventMap<EVENT_TYPE>): void
	}

	// prettier-ignore
	interface Document {
		addEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | AddEventListenerOptions): void
		removeEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | EventListenerOptions): void
		dispatchEvent<K extends keyof CustomEventMap | unknown>(evt: CustomEventMap[K]): void
	}

	// prettier-ignore
	interface Element {
		addEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | AddEventListenerOptions): void
		removeEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | EventListenerOptions): void
		dispatchEvent<K extends keyof CustomEventMap | unknown>(evt: CustomEventMap[K]): void
	}

	// prettier-ignore
	interface Window {
		addEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | AddEventListenerOptions): void
		removeEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | EventListenerOptions): void
		dispatchEvent<K extends keyof CustomEventMap | unknown>(evt: CustomEventMap[K]): void
	}
}
export {} //keep that for TS compiler.
