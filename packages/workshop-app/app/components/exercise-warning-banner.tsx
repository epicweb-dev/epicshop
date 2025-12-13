import { Link } from 'react-router'
import { Icon } from './icons.tsx'

export function ExerciseWarningBanner() {
	return (
		<div className="border-destructive bg-destructive fixed top-0 right-0 left-0 z-50 border-b">
			<div className="relative w-full p-4">
				{/* Full-banner clickable link, visually hidden but covers the banner */}
				<Link
					to="/workspace-structure"
					className="absolute inset-0 z-10 block h-full w-full"
					aria-label="Learn more about workspace structure"
				/>
				<div className="relative z-0 container flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Icon
							name="Error"
							className="text-destructive-foreground h-5 w-5"
						/>
						<div>
							<h3 className="text-destructive-foreground text-sm font-semibold">
								Warning: Changes detected in exercises directory
							</h3>
							<p className="text-destructive-foreground/80 text-xs">
								You should typically work in the playground directory, not the
								exercises directory.
							</p>
						</div>
					</div>
					<div className="text-destructive-foreground flex items-center gap-2 text-xs">
						<span>Learn more</span>
						<Icon name="ArrowRight" className="h-3 w-3" />
					</div>
				</div>
			</div>
		</div>
	)
}
