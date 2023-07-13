import React, { useState, useEffect } from 'react'
import { Icon } from './icons.tsx'
import { clsx } from 'clsx'

type ScrollToTopProps = {
	containerRef: React.RefObject<HTMLElement>
	className?: string
}

export const ScrollToTop = ({ containerRef, className }: ScrollToTopProps) => {
	const [showButton, setShowButton] = useState(false)

	useEffect(() => {
		const container = containerRef.current
		const handleScroll = () => {
			setShowButton((container?.scrollTop ?? 0) > 250)
		}
		container?.addEventListener('scroll', handleScroll)
		return () => container?.removeEventListener('scroll', handleScroll)
	}, [containerRef])

	const scrollToTop = () => {
		containerRef.current?.scrollTo({
			top: 0,
			behavior: 'smooth',
		})
	}

	return (
		<>
			{showButton && (
				<button
					onClick={scrollToTop}
					className={clsx('absolute z-50', className)}
				>
					<Icon size={28} name="ScrollToTop" title="Scroll to Top" />
				</button>
			)}
		</>
	)
}
