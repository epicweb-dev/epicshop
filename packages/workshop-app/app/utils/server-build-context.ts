import {
	createContext,
	type RouterContextProvider,
	type ServerBuild,
} from 'react-router'

export const serverBuildContext = createContext<
	Promise<ServerBuild> | ServerBuild | null
>(null)

export function getServerBuildFromContext(context: unknown) {
	if (context && typeof (context as RouterContextProvider).get === 'function') {
		return (context as RouterContextProvider).get(serverBuildContext)
	}

	if (context && typeof context === 'object' && 'serverBuild' in context) {
		return (
			context as { serverBuild?: Promise<ServerBuild> | ServerBuild | null }
		).serverBuild
	}

	return null
}
