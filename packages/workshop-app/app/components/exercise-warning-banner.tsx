import { Link } from 'react-router'
import { Icon } from './icons.tsx'

export function ExerciseWarningBanner() {
	return (
		<div className="fixed left-0 right-0 top-0 z-50 border-b border-destructive bg-destructive">
			<div className="relative w-full p-4">
				{/* Full-banner clickable link, visually hidden but covers the banner */}
				<Link
					to="/workspace-structure"
					className="absolute inset-0 z-10 block h-full w-full"
					aria-label="Learn more about workspace structure"
				/>
				<div className="container relative z-0 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Icon
							name="Error"
							className="h-5 w-5 text-destructive-foreground"
						/>
						<div>
							<h3 className="text-sm font-semibold text-destructive-foreground">
								Warning: Changes detected in exercises directory
							</h3>
							<p className="text-xs text-destructive-foreground/80">
								You should typically work in the playground directory, not the
								exercises directory.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 text-xs text-destructive-foreground">
						<span>Learn more</span>
						<Icon name="ArrowRight" className="h-3 w-3" />
					</div>
				</div>
			</div>
		</div>
	)
}
