import { setPreferences } from '@epic-web/workshop-utils/db.server'
import { type ActionFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	if (request.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 })
	}

	const formData = await request.formData()
	await setPreferences({ playground: { persist: true } })

	return dataWithPE(request, formData, { status: 'success' } as const, {
		headers: await createToastHeaders({
			type: 'success',
			title: 'Playground persistence enabled',
			description:
				'Future playground sets will save a copy in saved-playgrounds.',
		}),
	})
}
