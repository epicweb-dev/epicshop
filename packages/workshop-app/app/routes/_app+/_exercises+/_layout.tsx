import { Outlet } from '@remix-run/react'

export default function ExercisesLayout() {
	return (
		<div className="flex flex-grow">
			<Outlet />
		</div>
	)
}
