import { setPreferences } from '@epic-web/workshop-utils/db.server'
import { data } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function action() {
	ensureUndeployed()

	await setPreferences({
		playgroundTip: { dismissed: true },
	})

	return data({ success: true })
}
