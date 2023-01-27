import { Link } from '@remix-run/react'

export default function Index() {
	return (
		<main className="relative min-h-screen bg-white">
			<h1>Welcome to the app</h1>
			<Link to="/whatever" className="text-blue-800 underline">
				Go to "/whatever"
			</Link>
		</main>
	)
}
