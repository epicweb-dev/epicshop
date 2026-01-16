import { markOnboardingComplete } from '@epic-web/workshop-utils/db.server'
import { type ActionFunctionArgs } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { ensureProgressiveEnhancement } from '#app/utils/pe.tsx'

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()

	if (request.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 })
	}

	const formData = await request.formData()
	const featureId = formData.get('featureId')

	if (typeof featureId !== 'string' || !featureId) {
		return Response.json({ error: 'featureId is required' }, { status: 400 })
	}

	await markOnboardingComplete(featureId)

	ensureProgressiveEnhancement(request, formData)

	return Response.json({ success: true })
}
