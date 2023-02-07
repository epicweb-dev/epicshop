import { Link, Outlet } from '@remix-run/react'

export default function App() {
	return (
		<div className="h-full">
			<nav>
				<Link to="/">Home</Link>
			</nav>
			<div className="h-5/6">
				<Outlet />
			</div>
		</div>
	)
}
