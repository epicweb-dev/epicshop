import { Outlet } from '@remix-run/react'

export default function ExercisesLayout() {
	return (
		<div className="flex h-full flex-grow">
			<Outlet />
		</div>
	)
}
