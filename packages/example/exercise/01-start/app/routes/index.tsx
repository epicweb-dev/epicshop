import { Link } from '@remix-run/react'

export default function Index() {
	return (
		<main className="relative min-h-screen bg-white sm:flex sm:items-center sm:justify-center">
			<h1>Welcome to the app</h1>
			<Link to="/whatever">Whatever</Link>
		</main>
	)
}
