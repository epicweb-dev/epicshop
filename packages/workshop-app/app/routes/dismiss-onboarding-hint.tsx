import { setPreferences } from '@epic-web/workshop-utils/db.server'
import { data, type ActionFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function action({ request: _request }: ActionFunctionArgs) {
	ensureUndeployed()

	await setPreferences({
		onboardingHint: { dismissed: true },
	})

	return data({ success: true })
}
