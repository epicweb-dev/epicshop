'use client'

import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useFetcher, useFetchers } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { SimpleTooltip } from '#app/components/ui/tooltip.tsx'
import { useHints } from '#app/utils/client-hints.client.tsx'
import { ErrorList } from '#app/utils/forms.tsx'
import { usePERedirectInput } from '#app/utils/pe.client.tsx'
import { useRequestInfo } from '#app/utils/root-loader.ts'
import { type Route } from './+types/index.tsx'
import { ROUTE_PATH, ThemeFormSchema } from './theme-shared.ts'

export function ThemeSwitch() {
	const requestInfo = useRequestInfo()
	const peRedirectInput = usePERedirectInput()
	const fetcher = useFetcher<Route.ComponentProps['actionData']>()

	const [form] = useForm({
		lastResult: fetcher.data,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ThemeFormSchema })
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
		<fetcher.Form method="POST" action={ROUTE_PATH} {...getFormProps(form)}>
			<div className="flex gap-2">
				{peRedirectInput}
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
		(f) => f.formData?.get('intent') === 'update-theme',
	)
	const optimisticTheme = fetcher?.formData?.get('theme')
	if (optimisticTheme === 'system') return hints.theme
	if (optimisticTheme === 'light' || optimisticTheme === 'dark') {
		return optimisticTheme
	}
	return requestInfo.session.theme ?? hints.theme
}
