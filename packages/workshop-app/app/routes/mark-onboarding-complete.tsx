import { markOnboardingComplete } from '@epic-web/workshop-utils/db.server'
import { type ActionFunctionArgs } from 'react-router'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 })
	}

	const formData = await request.formData()
	const featureId = formData.get('featureId')

	if (typeof featureId !== 'string' || !featureId) {
		return Response.json({ error: 'featureId is required' }, { status: 400 })
	}

	await markOnboardingComplete(featureId)

	return Response.json({ success: true })
}
