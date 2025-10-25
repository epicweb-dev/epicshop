import { randomUUID as cuid } from 'crypto'
import { createCookieSessionStorage, redirect } from 'react-router'
import { z } from 'zod'
import { combineHeaders } from './misc.tsx'

export const toastKey = 'toast'

const TypeSchema = z.enum(['message', 'success', 'error'])
const ToastSchema = z
	.object({
		description: z.string(),
		id: z.string().default(() => cuid()),
		title: z.string().optional(),
		type: TypeSchema.default('message'),
	})
	.transform((toast) => ({
		...toast,
		title: toast.title ? sanitizeCookieValue(toast.title) : undefined,
		description: sanitizeCookieValue(toast.description),
	}))

export type Toast = z.infer<typeof ToastSchema>
export type OptionalToast = Omit<Toast, 'id' | 'type'> & {
	id?: string
	type?: z.infer<typeof TypeSchema>
}

export const toastSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'EpicShop_toast',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: ['not-so-secret'],
		secure: process.env.NODE_ENV === 'production',
	},
})

/**
 * Sanitizes a string value to ensure it can be safely stored in a cookie.
 * Removes or replaces characters that cannot be converted to ByteString.
 */
function sanitizeCookieValue(value: string): string {
	// Remove or replace characters with Unicode values > 255
	return value
		.split('')
		.map((char) => {
			const code = char.charCodeAt(0)
			// If character is > 255, replace with a safe alternative
			if (code > 255) {
				// Replace smart quotes with regular quotes
				if (code === 8216 || code === 8217) return "'" // smart single quote
				if (code === 8220 || code === 8221) return '"' // smart double quote
				if (code === 8211 || code === 8212) return '-' // en dash and em dash
				// Replace other high Unicode characters with a safe fallback
				return '?'
			}
			return char
		})
		.join('')
}

export async function redirectWithToast(
	url: string,
	toast: OptionalToast,
	init?: ResponseInit,
) {
	return redirect(url, {
		...init,
		headers: combineHeaders(init?.headers, await createToastHeaders(toast)),
	})
}

export async function createToastHeaders(optionalToast: OptionalToast) {
	const session = await toastSessionStorage.getSession()
	const toast = ToastSchema.parse(optionalToast)
	session.flash(toastKey, toast)
	const cookie = await toastSessionStorage.commitSession(session)
	return new Headers({ 'set-cookie': cookie })
}

export async function getToast(request: Request) {
	const session = await toastSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const result = ToastSchema.safeParse(session.get(toastKey))
	const toast = result.success ? result.data : null
	return {
		toast,
		headers: toast
			? new Headers({
					'set-cookie': await toastSessionStorage.destroySession(session),
				})
			: null,
	}
}
