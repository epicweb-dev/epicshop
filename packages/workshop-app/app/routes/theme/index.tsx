import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { dataWithPE } from '#app/utils/pe.tsx'
import { type Route } from './+types/index.tsx'
import { ROUTE_PATH, ThemeFormSchema } from './theme-shared.ts'
import { setTheme } from './theme-session.server.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const referrer = request.headers.get('Referer')
	return redirect(safeRedirect(referrer ?? '/'), {
		headers: { 'Cache-Control': 'no-cache' },
	})
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ThemeFormSchema,
	})
	if (submission.status !== 'success') {
		return data(submission.reply(), {
			// You can also use the status to determine the HTTP status code
			status: submission.status === 'error' ? 400 : 200,
		})
	}
	const { theme } = submission.value

	const responseInit = {
		headers: { 'set-cookie': setTheme(theme) },
	}
	return dataWithPE(request, formData, submission.reply(), responseInit)
}
