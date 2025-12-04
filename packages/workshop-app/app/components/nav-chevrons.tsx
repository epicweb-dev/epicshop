import { Link, type LinkProps } from 'react-router'
import { Icon } from './icons.tsx'

export function NavChevrons({
	prev,
	next,
}: {
	prev?: LinkProps | null
	next?: LinkProps | null
}) {
	return (
		<div className="relative flex h-full overflow-hidden">
			{prev ? (
				<Link
					prefetch="intent"
					{...prev}
					data-keyboard-action="g+p"
					className="group flex h-full items-center justify-center border-l px-7"
					children={
						<>
							<Icon
								name="ChevronLeft"
								className="absolute opacity-100 transition duration-300 ease-in-out group-hover:translate-y-10 group-hover:opacity-0"
							/>
							<Icon
								name="ChevronLeft"
								className="absolute -translate-y-10 opacity-0 transition duration-300 ease-in-out group-hover:translate-y-0 group-hover:opacity-100"
							/>
						</>
					}
				/>
			) : null}
			{next ? (
				<Link
					prefetch="intent"
					{...next}
					data-keyboard-action="g+n"
					className="group flex h-full items-center justify-center border-l px-7"
					children={
						<>
							<Icon
								name="ChevronRight"
								className="absolute opacity-100 transition duration-300 ease-in-out group-hover:translate-y-10 group-hover:opacity-0"
							/>
							<Icon
								name="ChevronRight"
								className="absolute -translate-y-10 opacity-0 transition duration-300 ease-in-out group-hover:translate-y-0 group-hover:opacity-100"
							/>
						</>
					}
				/>
			) : null}
		</div>
	)
}
