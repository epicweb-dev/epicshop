import type { Route } from './+types/mark-onboarding-complete'
import { markOnboardingComplete } from '@epic-web/workshop-utils/db.server'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { ensureProgressiveEnhancement } from '#app/utils/pe.tsx'

export async function action({ request }: Route.ActionArgs) {
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
