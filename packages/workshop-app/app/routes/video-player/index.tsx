import { setPreferences } from '@epic-web/workshop-utils/db.server'
import { data, type ActionFunctionArgs } from 'react-router'
import { PlayerPreferencesSchema } from './player-preferences-schema.ts'

export async function action({ request }: ActionFunctionArgs) {
	const result = PlayerPreferencesSchema.safeParse(await request.json())
	if (!result.success) {
		return data({ status: 'error', error: result.error.flatten() } as const, {
			status: 400,
		})
	}
	await setPreferences({ player: result.data })
	return { status: 'success' } as const
}
