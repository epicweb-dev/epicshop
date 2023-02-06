import type { LinksFunction, V2_MetaFunction } from '@remix-run/node'
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from '@remix-run/react'

import reachTabsStylesheetUrl from '@reach/tabs/styles.css'
import appStylesheetUrl from './styles/app.css'
import tailwindStylesheetUrl from './styles/tailwind.css'

export const links: LinksFunction = () => {
	return [
		{ rel: 'stylesheet', href: tailwindStylesheetUrl },
		{ rel: 'stylesheet', href: appStylesheetUrl },
		{ rel: 'stylesheet', href: reachTabsStylesheetUrl },
	]
}

export const meta: V2_MetaFunction = () => {
	return [
		{ charSet: 'utf-8' },
		{ name: 'viewport', content: 'width=device-width,initial-scale=1' },
		{ name: 'title', content: 'Remix Workshop App' },
	]
}

export default function App() {
	return (
		<html lang="en" className="h-full">
			<head>
				<Meta />
				<Links />
			</head>
			<body className="h-full">
				<Outlet />
				<ScrollRestoration />
				<Scripts />
				<LiveReload />
			</body>
		</html>
	)
}
