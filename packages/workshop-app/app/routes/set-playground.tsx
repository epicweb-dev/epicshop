import {
	getAppByName,
	getApps,
	isPlaygroundApp,
	isProblemApp,
	isSolutionApp,
	setPlayground,
} from '@epic-web/workshop-utils/apps.server'
import { markOnboardingComplete } from '@epic-web/workshop-utils/db.server'
import { getDiffCode } from '@epic-web/workshop-utils/diff.server'
import { clearTestProcessEntry } from '@epic-web/workshop-utils/process-manager.server'
import { type ActionFunctionArgs } from 'react-router'
import { z } from 'zod'
import { ensureUndeployed, getErrorMessage } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { PLAYGROUND_ONBOARDING_FEATURE_ID } from './set-playground-constants.ts'

const SetPlaygroundSchema = z.object({
	appName: z.string(),
	reset: z
		.string()
		.nullable()
		.optional()
		.transform((v) => v === 'true'),
})

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const rawData = {
		appName: formData.get('appName'),
		redirectTo: formData.get('redirectTo'),
	}
	const result = SetPlaygroundSchema.safeParse(rawData)
	if (!result.success) {
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: result.error.message } as const,
			{ status: 400 },
		)
	}
	const form = result.data
	const app = await getAppByName(form.appName)
	if (!app) {
		return dataWithPE(
			request,
			formData,
			{ status: 'error', error: `App ${form.appName} not found` } as const,
			{ status: 404 },
		)
	}
	const converseApp =
		isProblemApp(app) && app.solutionName
			? await getAppByName(app.solutionName)
			: isSolutionApp(app) && app.problemName
				? await getAppByName(app.problemName)
				: undefined
	try {
		await setPlayground(app.fullPath, { reset: form.reset })
	} catch (error: unknown) {
		const message = getErrorMessage(error)
		console.error('Error setting playground', message)
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
	await markOnboardingComplete(PLAYGROUND_ONBOARDING_FEATURE_ID)
	return dataWithPE(request, formData, { status: 'success' } as const)
}
