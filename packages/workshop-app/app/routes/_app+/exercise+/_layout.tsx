import { getExercises } from '@epic-web/workshop-utils/apps.server'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import { serverOnly$ } from 'vite-env-only/macros'

export const handle: SEOHandle = {
	getSitemapEntries: serverOnly$(async (request) => {
		const exercises = await getExercises({ request })
		return exercises.flatMap((e) => [
			{ route: `/exercise/${e.exerciseNumber.toString().padStart(2, '0')}` },
			...e.steps.flatMap((s) =>
				['problem', 'solution'].map((type) => ({
					route: `/exercise/${e.exerciseNumber.toString().padStart(2, '0')}/${s.stepNumber.toString().padStart(2, '0')}/${type}`,
				})),
			),
			{
				route: `/exercise/${e.exerciseNumber.toString().padStart(2, '0')}/finished`,
			},
		])
	}),
}

export default function ExercisesLayout() {
	return (
		<div className="flex h-full grow">
			<Outlet />
		</div>
	)
}
