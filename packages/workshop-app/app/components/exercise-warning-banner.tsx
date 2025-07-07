import { Link } from 'react-router'
import { Icon } from './icons.tsx'

export function ExerciseWarningBanner() {
	return (
		<div className="fixed top-0 left-0 right-0 z-50 border-b border-destructive bg-destructive/10 p-4">
			<div className="container flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Icon name="Error" className="h-5 w-5 text-destructive" />
					<div>
						<h3 className="text-sm font-semibold text-destructive">
							Warning: Changes detected in exercises directory
						</h3>
						<p className="text-xs text-destructive/80">
							You should typically work in the playground directory, not the exercises directory.
						</p>
					</div>
				</div>
				<Link
					to="/workspace-structure"
					className="flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/80"
				>
					<span>Learn more</span>
					<Icon name="ArrowRight" className="h-3 w-3" />
				</Link>
			</div>
		</div>
	)
}