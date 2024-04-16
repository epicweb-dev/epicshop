import * as cookie from 'cookie'

const cookieName = 'EpicShop_theme'
export type Theme = 'light' | 'dark'

export function getTheme(request: Request): Theme | null {
	const cookieHeader = request.headers.get('cookie')
	const parsed = cookieHeader ? cookie.parse(cookieHeader)[cookieName] : null
	if (parsed === 'light' || parsed === 'dark') return parsed
	return null
}

export function setTheme(theme: Theme | 'system') {
	return cookie.serialize(cookieName, theme, {
		path: '/',
		maxAge: theme === 'system' ? 0 : 60 * 60 * 365 * 100,
	})
}
