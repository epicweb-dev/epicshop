// @ts-ignore-next-line
import Baffle from 'baffle-react'

const Loading: React.FC<React.PropsWithChildren> = ({ children }) => {
	return (
		<div
			className="flex items-center gap-2 font-mono text-sm font-medium uppercase"
			role="status"
		>
			<div aria-hidden="true">
				<Baffle
					speed={100}
					revealDuration={1000}
					revealDelay={500}
					characters="█▓>█ ▒░/▒░ <█░▒▓/ █▒▒ ▓▒▓/█<░▒ ▓/░>"
				>
					ab
				</Baffle>
			</div>
			{children ? children : 'Loading'}
			<div aria-hidden="true">
				<Baffle
					speed={100}
					revealDuration={1000}
					revealDelay={500}
					characters="█<▓█ ▒░/▒░ █░>▒▓/ █▒▒ ▓▒▓/█<░▒ ▓/░>"
				>
					ab
				</Baffle>
			</div>
		</div>
	)
}

export default Loading
