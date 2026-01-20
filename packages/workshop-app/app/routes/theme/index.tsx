import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect, useFetcher, useFetchers } from 'react-router'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { useHints } from '#app/utils/client-hints.tsx'
import { ErrorList } from '#app/utils/forms.tsx'
import { dataWithPE, usePERedirectInput } from '#app/utils/pe.tsx'
import { useRequestInfo } from '#app/utils/root-loader.ts'
import { type Route } from './+types/index.tsx'
import { setTheme } from './theme-session.server.ts'

const ROUTE_PATH = '/theme'

const ThemeFormSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']),
})
const ThemeFormSchemaForConform = ThemeFormSchema as z.ZodTypeAny
const parseWithZodUnsafe = parseWithZod as unknown as (
	formData: FormData,
	options: { schema: z.ZodTypeAny },
) => any

export async function loader({ request }: Route.LoaderArgs) {
	const referrer = request.headers.get('Referer')
	return redirect(safeRedirect(referrer ?? '/'), {
		headers: { 'Cache-Control': 'no-cache' },
	})
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZodUnsafe(formData, {
		schema: ThemeFormSchemaForConform,
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

export function ThemeSwitch({
	disableTooltip,
}: { disableTooltip?: boolean } = {}) {
	const requestInfo = useRequestInfo()
	const peRedirectInput = usePERedirectInput()
	const fetcher = useFetcher<Route.ComponentProps['actionData']>()

	const [form] = useForm({
		lastResult: fetcher.data,
		onValidate({ formData }) {
			return parseWithZodUnsafe(formData, {
				schema: ThemeFormSchemaForConform,
			})
		},
	})

	const mode = requestInfo.session.theme ?? 'system'
	const nextMode =
		mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
	const modeLabel = {
		light: <Icon size="md" name="Sun" title="Light mode" />,
		dark: <Icon size="md" name="Moon" title="Dark mode" />,
		system: <Icon size="md" name="Laptop" title="System mode" />,
	}

	const button = (
		<button
			type="submit"
			name="intent"
			value="update-theme"
			className="flex h-8 w-8 cursor-pointer items-center justify-center"
		>
			{modeLabel[mode]}
		</button>
	)

	return (
		<fetcher.Form method="POST" action={ROUTE_PATH} {...getFormProps(form)}>
			<div className="flex gap-2">
				{peRedirectInput}
				<input type="hidden" name="theme" value={nextMode} />
				{disableTooltip ? (
					button
				) : (
					<SimpleTooltip content={`Change theme from ${mode} mode`}>
						{button}
					</SimpleTooltip>
				)}
			</div>
			<ErrorList errors={form.errors} id={form.errorId} />
		</fetcher.Form>
	)
}

/**
 * @returns the user's theme preference, or the client hint theme if the user
 * has not set a preference.
 */
export function useTheme() {
	const hints = useHints()
	const requestInfo = useRequestInfo()
	const fetchers = useFetchers()
	const fetcher = fetchers.find(
		(f) => f.formData?.get('intent') === 'update-theme',
	)
	const optimisticTheme = fetcher?.formData?.get('theme')
	if (optimisticTheme === 'system') return hints.theme
	if (optimisticTheme === 'light' || optimisticTheme === 'dark') {
		return optimisticTheme
	}
	return requestInfo.session.theme ?? hints.theme
}
