import {
	getPreferences,
	setPreferences,
} from '@epic-web/workshop-utils/db.server'
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
	const persistValue = formData.get('persist')
	const currentPersist = (await getPreferences())?.playground?.persist ?? false
	const nextPersist =
		persistValue === 'true'
			? true
			: persistValue === 'false'
				? false
				: !currentPersist
	await setPreferences({ playground: { persist: nextPersist } })

	return dataWithPE(
		request,
		formData,
		{ status: 'success', persist: nextPersist } as const,
		{
			headers: await createToastHeaders({
				type: 'success',
				title: nextPersist
					? 'Playground persistence enabled'
					: 'Playground persistence disabled',
				description: nextPersist
					? 'Future playground sets will save a copy in saved-playgrounds.'
					: 'Playground sets will no longer save copies.',
			}),
		},
	)
}
