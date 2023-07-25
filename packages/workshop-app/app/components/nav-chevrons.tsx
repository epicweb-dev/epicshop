import { Link, type LinkProps } from '@remix-run/react'
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
					className="group flex h-full items-center justify-center border-l border-border px-7"
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
					className="group flex h-full items-center justify-center border-l border-border px-7"
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
