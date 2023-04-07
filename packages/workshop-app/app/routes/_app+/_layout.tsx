import { Outlet } from '@remix-run/react'
import { ToastHub } from '~/components/toast'

export default function App() {
	return (
		<div className="flex min-h-screen bg-white text-black">
			<div className="flex flex-grow">
				<Outlet />
				<ToastHub />
			</div>
		</div>
	)
}
