declare module 'virtual:react-router/unstable_rsc/inject-hmr-runtime' {}

declare module 'virtual:react-router/unstable_rsc/routes' {
	import { type unstable_RSCRouteConfigEntry } from 'react-router'
	const routes: unstable_RSCRouteConfigEntry[]
	export default routes
}

declare module 'virtual:react-router/unstable_rsc/basename' {
	const basename: string | undefined
	export default basename
}

declare module 'virtual:react-router/unstable_rsc/react-router-serve-config' {
	const config: unknown
	export default config
}

declare module 'server-only' {}
declare module 'client-only' {}

interface ImportMeta {
	viteRsc: {
		loadModule<T>(id: string, entry: string): Promise<T>
		loadBootstrapScriptContent(entry: string): Promise<string>
	}
}
