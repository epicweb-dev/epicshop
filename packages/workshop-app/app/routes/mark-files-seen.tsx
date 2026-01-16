import { setPreferences } from '@epic-web/workshop-utils/db.server'
import { type ActionFunctionArgs } from 'react-router'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 })
	}

	await setPreferences({
		onboarding: { hasSeenFilesTooltip: true },
	})

	return Response.json({ success: true })
}
