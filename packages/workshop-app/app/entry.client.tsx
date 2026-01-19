import 'virtual:react-router/unstable_rsc/inject-hmr-runtime'

import {
	createFromReadableStream,
	createTemporaryReferenceSet,
	encodeReply,
	setServerCallback,
} from '@vitejs/plugin-rsc/browser'
import { startTransition, StrictMode } from 'react'
import { hydrateRoot, type ReactFormState } from 'react-dom/client'
import {
	unstable_createCallServer as createCallServer,
	unstable_getRSCStream as getRSCStream,
	unstable_RSCHydratedRouter as RSCHydratedRouter,
	type unstable_RSCPayload as RSCPayload,
} from 'react-router/dom'
import { init as initKeyboardShortcuts } from './utils/keyboard-shortcuts.client'
import { init as initMonitoring } from './utils/monitoring.client'

initKeyboardShortcuts()
initMonitoring()

setServerCallback(
	createCallServer({
		createFromReadableStream,
		createTemporaryReferenceSet,
		encodeReply,
	}),
)

void createFromReadableStream<RSCPayload>(getRSCStream()).then((payload) => {
	startTransition(async () => {
		const formState =
			payload.type === 'render'
				? ((await payload.formState) as ReactFormState | null)
				: undefined

		hydrateRoot(
			document,
			<StrictMode>
				<RSCHydratedRouter
					payload={payload}
					createFromReadableStream={createFromReadableStream}
				/>
			</StrictMode>,
			{
				formState,
			},
		)
	})
})
