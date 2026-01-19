import {
	getAppByName,
	getApps,
	getSavedPlaygrounds,
	isPlaygroundApp,
	isProblemApp,
	isSolutionApp,
	setPlayground,
} from '@epic-web/workshop-utils/apps.server'
import { getPreferences } from '@epic-web/workshop-utils/db.server'
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import { clearTestProcessEntry } from '@epic-web/workshop-utils/process-manager.server'
import {
	data,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from 'react-router'
import { z } from 'zod'
import { ensureUndeployed, getErrorMessage } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server.ts'

const SavedPlaygroundSchema = z.object({
	savedPlaygroundId: z.string().min(1),
})

export async function loader({ request: _request }: LoaderFunctionArgs) {
	ensureUndeployed()
	const persistEnabled = (await getPreferences())?.playground?.persist ?? false
	if (!persistEnabled) {
		return data({ status: 'disabled', savedPlaygrounds: [] } as const)
	}
	const savedPlaygrounds = await getSavedPlaygrounds()
	return data({
		status: 'success',
		savedPlaygrounds: savedPlaygrounds.map(({ id, appName, createdAt }) => ({
			id,
			appName,
			createdAt,
		})),
	} as const)
}

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	if (request.method !== 'POST') {
		return Response.json({ error: 'Method not allowed' }, { status: 405 })
	}
	const formData = await request.formData()
	const rawData = {
		savedPlaygroundId: formData.get('savedPlaygroundId'),
	}
	const result = SavedPlaygroundSchema.safeParse(rawData)
	if (!result.success) {
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: result.error.message } as const,
			{ status: 400 },
		)
	}

	const persistEnabled = (await getPreferences())?.playground?.persist ?? false
	if (!persistEnabled) {
		return dataWithPE(
			request,
			formData,
			{
				status: 'error',
				error:
					'Enable playground persistence in Preferences to use saved playgrounds.',
			} as const,
			{
				status: 403,
				headers: await createToastHeaders({
					type: 'error',
					title: 'Persistence disabled',
					description:
						'Enable playground persistence in Preferences to use saved playgrounds.',
				}),
			},
		)
	}

	const savedPlaygrounds = await getSavedPlaygrounds()
	const savedPlayground = savedPlaygrounds.find(
		(entry) => entry.id === result.data.savedPlaygroundId,
	)
	if (!savedPlayground) {
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: 'Saved playground not found.' } as const,
			{ status: 404 },
		)
	}

	const app = await getAppByName(savedPlayground.appName)
	const converseApp =
		app && isProblemApp(app) && app.solutionName
			? await getAppByName(app.solutionName)
			: app && isSolutionApp(app) && app.problemName
				? await getAppByName(app.problemName)
				: undefined

	try {
		await setPlayground(savedPlayground.fullPath)
	} catch (error: unknown) {
		const message = getErrorMessage(error)
		console.error('Error setting playground from saved copy', message)
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: message } as const,
			{
				status: 500,
				headers: await createToastHeaders({
					type: 'error',
					title: 'Error',
					description:
						'There was an error setting the playground. Check the terminal for details.',
				}),
			},
		)
	}

	const apps = await getApps({ forceFresh: true })
	const playground = apps.find(isPlaygroundApp)
	if (playground) {
		clearTestProcessEntry(playground)
		if (converseApp) {
			void getDiffCode(playground, converseApp, { forceFresh: true })
		}
	}

	return dataWithPE(
		request,
		formData,
		{ status: 'success', savedPlaygroundId: savedPlayground.id } as const,
		{
			headers: await createToastHeaders({
				type: 'success',
				title: 'Playground restored',
				description: `Set playground from saved copy (${savedPlayground.appName}).`,
			}),
		},
	)
}
