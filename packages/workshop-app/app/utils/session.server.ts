import { createCookieSessionStorage } from '@remix-run/node'

const storage = createCookieSessionStorage({
	cookie: {
		name: '__KCD_SHOP_SESSION',
		httpOnly: true,
		secure: false,
		path: '/',
		sameSite: 'lax',
		secrets: [`I'm local only anyway 🤷‍♂️`],
	},
})

export { storage }
