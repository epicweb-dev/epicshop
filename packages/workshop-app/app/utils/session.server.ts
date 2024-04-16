import { createCookieSessionStorage } from '@remix-run/node'

const storage = createCookieSessionStorage({
	cookie: {
		name: '__EPICSHOP_SESSION',
		httpOnly: true,
		secure: false,
		path: '/',
		sameSite: 'lax',
		secrets: [`I'm local only anyway 🤷‍♂️`],
	},
})

export { storage }
