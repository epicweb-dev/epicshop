import { muteNotification } from '@epic-web/workshop-utils/db.server'
import { data, type ActionFunctionArgs } from 'react-router'

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	const id = formData.get('id')
	if (typeof id !== 'string') {
		return data({ error: 'Invalid notification id' }, { status: 400 })
	}
	if (intent === 'mute') {
		await muteNotification(id)
		return data({ success: true })
	}
	return data({ error: 'Invalid intent' }, { status: 400 })
}
