import { Link, Outlet } from '@remix-run/react'

export default function App() {
	return (
		<div className="flex min-h-screen flex-col">
			<nav>
				<Link to="/">Home</Link>
			</nav>
			<div className="flex flex-grow flex-col">
				<Outlet />
			</div>
		</div>
	)
}
