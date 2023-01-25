import { Link, Outlet } from '@remix-run/react'

export default function App() {
	return (
		<div>
			<nav>
				<Link to="/">Home</Link>
			</nav>
			<Outlet />
		</div>
	)
}
