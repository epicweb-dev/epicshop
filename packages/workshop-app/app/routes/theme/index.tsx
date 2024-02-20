import { useForm } from '@conform-to/react'
import { parse } from '@conform-to/zod'
import { json, redirect, type ActionFunctionArgs } from '@remix-run/node'
import { useFetcher, useFetchers } from '@remix-run/react'
import * as React from 'react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { setTheme } from './theme-session.server.ts'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { useHints } from '#app/utils/client-hints.tsx'
import { ErrorList } from '#app/utils/forms.tsx'
import { useRequestInfo } from '#app/utils/request-info.ts'

const ROUTE_PATH = '/theme'

const ThemeFormSchema = z.object({
	redirectTo: z.string().optional(),
	theme: z.enum(['system', 'light', 'dark']),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const submission = parse(formData, {
		schema: ThemeFormSchema,
	})
	if (!submission.value) {
		return json(
			{
				status: 'error',
				submission,
			} as const,
			{ status: 400 },
		)
	}
	if (submission.intent !== 'submit') {
		return json({ status: 'success', submission } as const)
	}
	const { redirectTo, theme } = submission.value

	const responseInit = {
		headers: { 'set-cookie': setTheme(theme) },
	}
	if (redirectTo) {
		return redirect(safeRedirect(redirectTo), responseInit)
	} else {
		return json({ success: true, submission }, responseInit)
	}
}

export function ThemeSwitch() {
	const requestInfo = useRequestInfo()
	const fetcher = useFetcher<typeof action>()
	const [isHydrated, setIsHydrated] = React.useState(false)

	React.useEffect(() => {
		setIsHydrated(true)
	}, [])

	const [form] = useForm({
		id: 'onboarding',
		lastSubmission: fetcher.data?.submission,
		onValidate({ formData }) {
			return parse(formData, { schema: ThemeFormSchema })
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

	return (
		<fetcher.Form method="POST" action={ROUTE_PATH} {...form.props}>
			<div className="flex gap-2">
				{/*
					this is for progressive enhancement so we redirect them to the page
					they are on if the JavaScript hasn't had a chance to hydrate yet.
				*/}
				{isHydrated ? null : (
					<input type="hidden" name="redirectTo" value={requestInfo.path} />
				)}
				<input type="hidden" name="theme" value={nextMode} />
				<SimpleTooltip content={`Change theme from ${mode} mode`}>
					<button
						type="submit"
						name="intent"
						value="update-theme"
						className="flex h-8 w-8 cursor-pointer items-center justify-center"
					>
						{modeLabel[mode]}
					</button>
				</SimpleTooltip>
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
		f => f.formData?.get('intent') === 'update-theme',
	)
	const optimisticTheme = fetcher?.formData?.get('theme')
	if (optimisticTheme === 'system') return hints.theme
	if (optimisticTheme === 'light' || optimisticTheme === 'dark') {
		return optimisticTheme
	}
	return requestInfo.session.theme ?? hints.theme
}
