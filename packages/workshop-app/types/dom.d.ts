declare global {
	type EventDetail = { title?: string; content?: string }

	interface CustomEventMap {
		'kcdshop-error': CustomEvent<EventDetail>
		'kcdshop-launchEditor-submitted': CustomEvent
	}
	interface CustomEventListener<EVENT_TYPE>
		extends EventListenerOrEventListenerObject {
		(evt: CustomEventMap<EVENT_TYPE>): void
	}

	// prettier-ignore
	interface Document {
		addEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | AddEventListenerOptions): void
		removeEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | EventListenerOptions): void
		dispatchEvent<K extends keyof CustomEventMap>(evt: CustomEventMap[K]): void
	}

	// prettier-ignore
	interface HTMLElement {
		addEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | AddEventListenerOptions): void
		removeEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | EventListenerOptions): void
		dispatchEvent<K extends keyof CustomEventMap>(evt: CustomEventMap[K]): void
	}

	// prettier-ignore
	interface Window {
		addEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | AddEventListenerOptions): void
		removeEventListener<K extends keyof CustomEventMap>(type: K, listener: CustomEventListener<K>, options?: boolean | EventListenerOptions): void
		dispatchEvent<K extends keyof CustomEventMap>(evt: CustomEventMap[K]): void
	}
}
export {} //keep that for TS compiler.
