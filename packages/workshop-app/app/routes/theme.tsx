import { parseWithZod } from '@conform-to/zod'
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod'
import { dataWithPE } from '#app/utils/pe.js'
import { setTheme } from './theme/theme-session.server.ts'

const ThemeFormSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']),
})

export async function action({ request }: ActionFunctionArgs) {
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
	return dataWithPE(formData, submission.reply(), responseInit)
}