import { Link, Outlet } from '@remix-run/react'

export default function App() {
	return (
		<div className="flex min-h-screen bg-white text-black">
			<div className="flex flex-grow">
				<Outlet />
			</div>
		</div>
	)
}
