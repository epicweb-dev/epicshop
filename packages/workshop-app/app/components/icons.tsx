import React from 'react'

type IconProperties = {
	className?: string
	viewBox?: string
	title?: string
	role?: string
	size?: '16' | '20' | '24' | '32' | '40'
	name: IconNames
}

export type IconNames = keyof typeof Icons

const Icons = {
	Github: () => (
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			fill="currentColor"
			d="M8,0.2c-4.4,0-8,3.6-8,8c0,3.5,2.3,6.5,5.5,7.6 C5.9,15.9,6,15.6,6,15.4c0-0.2,0-0.7,0-1.4C3.8,14.5,3.3,13,3.3,13c-0.4-0.9-0.9-1.2-0.9-1.2c-0.7-0.5,0.1-0.5,0.1-0.5 c0.8,0.1,1.2,0.8,1.2,0.8C4.4,13.4,5.6,13,6,12.8c0.1-0.5,0.3-0.9,0.5-1.1c-1.8-0.2-3.6-0.9-3.6-4c0-0.9,0.3-1.6,0.8-2.1 c-0.1-0.2-0.4-1,0.1-2.1c0,0,0.7-0.2,2.2,0.8c0.6-0.2,1.3-0.3,2-0.3c0.7,0,1.4,0.1,2,0.3c1.5-1,2.2-0.8,2.2-0.8 c0.4,1.1,0.2,1.9,0.1,2.1c0.5,0.6,0.8,1.3,0.8,2.1c0,3.1-1.9,3.7-3.7,3.9C9.7,12,10,12.5,10,13.2c0,1.1,0,1.9,0,2.2 c0,0.2,0.1,0.5,0.6,0.4c3.2-1.1,5.5-4.1,5.5-7.6C16,3.8,12.4,0.2,8,0.2z"
		/>
	),
	Twitter: () => (
		<path
			fill="currentColor"
			d="M16,3c-0.6,0.3-1.2,0.4-1.9,0.5c0.7-0.4,1.2-1,1.4-1.8c-0.6,0.4-1.3,0.6-2.1,0.8c-0.6-0.6-1.5-1-2.4-1 C9.3,1.5,7.8,3,7.8,4.8c0,0.3,0,0.5,0.1,0.7C5.2,5.4,2.7,4.1,1.1,2.1c-0.3,0.5-0.4,1-0.4,1.7c0,1.1,0.6,2.1,1.5,2.7 c-0.5,0-1-0.2-1.5-0.4c0,0,0,0,0,0c0,1.6,1.1,2.9,2.6,3.2C3,9.4,2.7,9.4,2.4,9.4c-0.2,0-0.4,0-0.6-0.1c0.4,1.3,1.6,2.3,3.1,2.3 c-1.1,0.9-2.5,1.4-4.1,1.4c-0.3,0-0.5,0-0.8,0c1.5,0.9,3.2,1.5,5,1.5c6,0,9.3-5,9.3-9.3c0-0.1,0-0.3,0-0.4C15,4.3,15.6,3.7,16,3z"
		/>
	),
	ArrowLeft: () => (
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M8.707 1.707A1 1 0 0 0 7.293.293l-7 7a1 1 0 0 0 0 1.414l7 7a1 1 0 0 0 1.414-1.414L3.414 9H15a1 1 0 1 0 0-2H3.414l5.293-5.293Z"
			clipRule="evenodd"
		/>
	),
	ArrowRight: () => (
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M7.293 1.707A1 1 0 0 1 8.707.293l7 7a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L12.586 9H1a1 1 0 1 1 0-2h11.586L7.293 1.707Z"
			clipRule="evenodd"
		/>
	),
	ExternalLink: () => (
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M15.924.617A.998.998 0 0 0 15 0h-5a1 1 0 1 0 0 2h2.586L5.293 9.293a1 1 0 0 0 1.414 1.414L14 3.414V6a1 1 0 1 0 2 0V.997a1 1 0 0 0-.076-.38ZM2.6 4a.6.6 0 0 0-.6.6v8.8a.6.6 0 0 0 .6.6h8.8a.6.6 0 0 0 .6-.6V8.6a1 1 0 1 1 2 0v4.8a2.6 2.6 0 0 1-2.6 2.6H2.6A2.6 2.6 0 0 1 0 13.4V4.6A2.6 2.6 0 0 1 2.6 2h4.8a1 1 0 1 1 0 2H2.6Z"
			clipRule="evenodd"
		/>
	),
	Loading: () => (
		<>
			<g fill="#212121">
				<text y="11.5px" x="3.5px" fontSize="9px">
					🐨
				</text>
				<g className="nc-loop-circle-2-16-icon-f">
					<path
						d="M8 16a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8zM8 2a6 6 0 1 0 6 6 6.006 6.006 0 0 0-6-6z"
						fill="#212121"
						opacity=".4"
					></path>
					<path d="M8 0v2a6.006 6.006 0 0 1 6 6h2a8.009 8.009 0 0 0-8-8z"></path>
				</g>
				<style>{`.nc-loop-circle-2-16-icon-f{--animation-duration:0.65s;transform-origin:8px 8px;animation:nc-loop-circle-2-anim var(--animation-duration) infinite cubic-bezier(.645,.045,.355,1)}@keyframes nc-loop-circle-2-anim{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
			</g>
		</>
	),
} as const

const Icon: React.FC<IconProperties> = ({
	viewBox,
	title,
	size,
	name,
	...props
}) => (
	<svg
		width={size}
		height={size}
		viewBox={viewBox}
		aria-hidden={!title}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		{title && <title>{title}</title>}
		{Icons[name]()}
	</svg>
)

Icon.defaultProps = {
	viewBox: '0 0 16 16',
	size: '16',
	role: 'img',
}

export default Icon
