import { invariant } from '@epic-web/invariant'
import { readEntryByPath } from '@epic-web/workshop-utils/cache.server'
import { type Route } from './+types/cache.$.ts'

export async function loader({ params }: Route.LoaderArgs) {
	const path = params['*']
	invariant(path, 'Path is required')
	const entry = await readEntryByPath(path)
	return { path, entry }
}
