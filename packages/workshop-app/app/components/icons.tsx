import React from 'react'

const Icons = {
	TriangleSmall: () => (
		<g
			strokeWidth={1.5}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<polygon points="2.5,0.5 14.5,8 2.5,15.5 " />
		</g>
	),
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
		<>
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeMiterlimit="10"
				strokeWidth={2}
				d="M6 2 1 8l5 6"
			/>

			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeMiterlimit="10"
				strokeWidth={2}
				d="M1.5 8H15"
			/>
		</>
	),
	ArrowRight: () => (
		<>
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeMiterlimit="10"
				strokeWidth={2}
				d="m10 2 5 6-5 6"
			/>
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeMiterlimit="10"
				strokeWidth={2}
				d="M14.5 8H1"
			/>
		</>
	),
	Unlinked: () => (
		<>
			<path
				d="M17.75 12.25L18 12C19.6569 10.3431 19.6569 7.65685 18 6C16.3431 4.34314 13.6569 4.34314 12 6L11.75 6.25"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.24996 11.75L5.99996 12C4.34311 13.6569 4.34311 16.3431 5.99996 18C7.65682 19.6569 10.3431 19.6569 12 18L12.25 17.75"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M8.25 4.75V6.25"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M15.75 17.75V19.25"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.25 8.25H4.75"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M19.25 15.75H17.75"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</>
	),
	Linked: () => (
		<>
			<path
				d="M11 14.25H12.5C15.1234 14.25 17.25 12.1234 17.25 9.5C17.25 6.87665 15.1234 4.75 12.5 4.75H9C6.65279 4.75 4.75 6.65279 4.75 9V10.25"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M13 9.75H11.5C8.87665 9.75 6.75 11.8766 6.75 14.5C6.75 17.1234 8.87665 19.25 11.5 19.25H15C17.3472 19.25 19.25 17.3472 19.25 15V13.75"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</>
	),
	Sun: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="8.5" y1="1.5" x2="8.5" y2="2.5" stroke="currentColor" />
			<line x1="13.45" y1="3.55" x2="12.743" y2="4.257" stroke="currentColor" />
			<line x1="15.5" y1="8.5" x2="14.5" y2="8.5" stroke="currentColor" />
			<line
				x1="13.45"
				y1="13.45"
				x2="12.743"
				y2="12.743"
				stroke="currentColor"
			/>
			<line x1="8.5" y1="15.5" x2="8.5" y2="14.5" stroke="currentColor" />
			<line x1="3.55" y1="13.45" x2="4.257" y2="12.743" stroke="currentColor" />
			<line x1="1.5" y1="8.5" x2="2.5" y2="8.5" stroke="currentColor" />
			<line x1="3.55" y1="3.55" x2="4.257" y2="4.257" stroke="currentColor" />
			<circle cx="8.5" cy="8.5" r="3" />
		</g>
	),
	Moon: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M13.5,10.5 c-4.418,0-8-3.582-8-8c0-0.557,0.057-1.1,0.166-1.625C2.668,1.857,0.5,4.674,0.5,8c0,4.142,3.358,7.5,7.5,7.5 c3.326,0,6.143-2.168,7.125-5.166C14.6,10.443,14.057,10.5,13.5,10.5z" />
		</g>
	),
	ChevronLeft: () => (
		<path
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeMiterlimit="10"
			strokeWidth={2}
			d="M10.5.5 5.5 8l5 7.5"
		/>
	),
	ChevronRight: () => (
		<path
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeMiterlimit="10"
			strokeWidth={2}
			d="m5.5.5 5 7.5-5 7.5"
		/>
	),
	ChevronDown: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<polyline points="15.5,5.5 8,10.5 0.5,5.5" />
		</g>
	),
	ChevronUp: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<polyline points="15.5,10.5 8,5.5 0.5,10.5" />
		</g>
	),
	CheckSmall: () => (
		<path
			d="M7,11c-.256,0-.512-.098-.707-.293l-2-2c-.391-.391-.391-1.023,0-1.414s1.023-.391,1.414,0l1.293,1.293,3.293-3.293c.391-.391,1.023-.391,1.414,0s.391,1.023,0,1.414l-4,4c-.195,.195-.451,.293-.707,.293Z"
			fill="currentColor"
		/>
	),
	TriangleDownSmall: () => (
		<path
			d="M11.943,5.269A.5.5,0,0,0,11.5,5h-7a.5.5,0,0,0-.409.787l3.5,5a.5.5,0,0,0,.818,0l3.5-5A.5.5,0,0,0,11.943,5.269Z"
			fill="currentColor"
		/>
	),
	Question: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="8" cy="8" r="7.5" />
			<circle cx="8.003" cy="12" r="1" stroke="none" fill="currentColor" />
			<path
				d="M6.5,3.577c.953-.86,3.018-.845,3.423.635C10.453,6.134,8,6.142,8,9"
				stroke="currentColor"
			/>
		</g>
	),
	Remove: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="8" cy="8" r="7.5" />
			<line x1="11" y1="5" x2="5" y2="11" stroke="currentColor" />
			<line x1="5" y1="5" x2="11" y2="11" stroke="currentColor" />
		</g>
	),
	ExternalLink: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="15.5" y1="0.5" x2="7.5" y2="8.5" stroke="currentColor" />
			<polyline points="8.5 0.5 15.5 0.5 15.5 7.5" stroke="currentColor" />
			<path d="M4.5.5H2A1.5,1.5,0,0,0,.5,2V14A1.5,1.5,0,0,0,2,15.5H14A1.5,1.5,0,0,0,15.5,14V11.5" />
		</g>
	),
	Refresh: () => (
		<g
			strokeWidth={1}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M14.5,8a6.5,6.5,0,1,1-1.022-3.5" stroke="currentColor" />
			<polyline points="13.5 0.5 13.5 4.5 9.5 4.5" />
		</g>
	),
	Files: () => (
		<>
			<path
				d="M2.1667 14.4167C2.16574 14.1866 2.21035 13.4915 2.29795 13.2787C2.38556 13.0659 2.51443 12.8727 2.67712 12.71C2.83981 12.5473 3.03312 12.4184 3.24587 12.3308C3.45862 12.2432 3.68662 12.1986 3.9167 12.1995H13.8334V1.00002H3.9167C3.68662 0.999054 3.45862 1.04366 3.24587 1.13127C3.03312 1.21887 2.83981 1.34774 2.67712 1.51043C2.51443 1.67312 2.38556 1.86643 2.29795 2.07918C2.21035 2.29194 2.16574 2.51994 2.1667 2.75002V14.4167Z"
				stroke="black"
				strokeWidth="1.16667"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M2.16669 14.4167V15H12.6667"
				stroke="black"
				strokeWidth="1.16667"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M5.66669 5.08331H10.3333"
				stroke="black"
				strokeWidth="1.16667"
				strokeLinecap="round"
			/>
			<path
				d="M5.66669 8H10.3333"
				stroke="black"
				strokeWidth="1.16667"
				strokeLinecap="round"
			/>
		</>
	),
	AnimatedBars: () => (
		<g fill="currentColor">
			<g className="nc-loop-dots-16-icon-f">
				<circle cx="3" cy="8" fill="currentColor" r="2" />
				<circle cx="8" cy="8" r="2" />
				<circle cx="13" cy="8" fill="currentColor" r="2" />
			</g>
			<style>{`.nc-loop-dots-16-icon-f{--animation-duration:1s}.nc-loop-dots-16-icon-f *{opacity:.4;transform:scale(.7)}.nc-loop-dots-16-icon-f :nth-child(1),.nc-loop-dots-16-icon-f :nth-child(3){animation:nc-loop-dots-anim-2b var(--animation-duration) infinite linear}.nc-loop-dots-16-icon-f :nth-child(1){transform-origin:3px 8px}.nc-loop-dots-16-icon-f :nth-child(2){animation:nc-loop-dots-anim-1b calc(var(--animation-duration)/2) infinite linear;animation-delay:calc(var(--animation-duration)/4);transform-origin:8px 8px}.nc-loop-dots-16-icon-f :nth-child(3){animation-delay:calc(var(--animation-duration)/2);transform-origin:13px 8px}@keyframes nc-loop-dots-anim-1b{0%,100%{opacity:.4;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}@keyframes nc-loop-dots-anim-2b{0%,100%,66%{opacity:.4;transform:scale(.7)}33%{opacity:1;transform:scale(1)}}`}</style>
		</g>
	),
	Clear: () => (
		<g
			strokeWidth={1.5}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="8" cy="8" r="7" />
			<line x1="3" y1="13" x2="13" y2="3" />
		</g>
	),
	Stop: () => (
		<g
			strokeWidth={2}
			fill="none"
			stroke="currentColor"
			strokeMiterlimit="10"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M14.5,15.5h-13 c-0.552,0-1-0.448-1-1v-13c0-0.552,0.448-1,1-1h13c0.552,0,1,0.448,1,1v13C15.5,15.052,15.052,15.5,14.5,15.5z" />
		</g>
	),
	Deleted: () => (
		<>
			<rect width="14" height="14" x="1" y="1" stroke="currentColor" rx="2" />
			<path
				fill="currentColor"
				d="M7.993 5.112H5.52V11h2.423c1.673 0 2.833-1.092 2.833-2.97 0-1.868-1.11-2.918-2.782-2.918Zm-.06 4.864H6.73v-3.84h1.204c.98 0 1.578.64 1.578 1.929 0 1.28-.597 1.911-1.579 1.911Z"
			/>
		</>
	),
	Modified: () => (
		<>
			<rect width="14" height="14" x="1" y="1" stroke="currentColor" rx="2" />
			<path
				fill="currentColor"
				d="M6.35 7.749 7.512 11h.999L9.68 7.749c.136-.393.324-.973.46-1.391a28.474 28.474 0 0 0-.05 1.442l-.02 3.2h1.135V5.112h-1.56l-1.297 3.72c-.086.257-.188.632-.273.94-.086-.308-.188-.683-.282-.94L6.47 5.113H4.798V11h1.135l-.017-3.191c0-.478-.026-1.135-.052-1.57.128.418.325 1.049.487 1.51Z"
			/>
		</>
	),
	Added: () => (
		<>
			<rect width="14" height="14" x="1" y="1" stroke="currentColor" rx="2" />
			<path
				fill="currentColor"
				d="M9.763 11h1.314L8.764 5.112H7.237L4.924 11h1.263l.52-1.425h2.535L9.762 11ZM7.049 8.645l.546-1.494c.137-.384.282-.819.384-1.134.103.315.248.75.384 1.134l.546 1.494H7.05Z"
			/>
		</>
	),
	Renamed: () => (
		<>
			<rect width="14" height="14" x="1" y="1" stroke="currentColor" rx="2" />
			<path
				fill="currentColor"
				d="m10.414 9.967-.162-.674c-.12-.486-.359-.836-.751-1.024.623-.273 1.032-.802 1.032-1.442 0-1.084-.776-1.715-2.261-1.715H5.635V11h1.212V8.747h1.092c.768 0 .982.29 1.084.683l.23.879c.052.196.145.46.29.691h1.212v-.102a4.374 4.374 0 0 1-.341-.93ZM6.847 7.774V6.12H8.17c.69 0 1.109.188 1.109.794 0 .622-.444.861-1.195.861H6.847Z"
			/>
		</>
	),
	Close: () => (
		<path
			stroke="currentColor"
			d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
		/>
	),
	// based on exclamation-circle from https://heroicons.com/
	Error: () => (
		<g fill="none" strokeWidth="2" stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
			/>
		</g>
	),
	// based on bell from https://heroicons.com/
	Notify: () => (
		<g fill="none" strokeWidth="2" stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
			/>
		</g>
	),
	// based on check from https://heroicons.com/
	Success: () => (
		<g fill="none" strokeWidth="2" stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M4.5 12.75l6 6 9-13.5"
			/>
		</g>
	),
} as const

export type IconNames = keyof typeof Icons

interface IconProps<T extends React.ElementType> {
	component?: T
	className?: string
	viewBox?: string
	title?: string
	role?: string
	size?: '16' | '20' | '24' | '28' | '32' | '40'
	name: IconNames
}

function Icon<T extends React.ElementType = 'svg'>({
	viewBox,
	title,
	size,
	name,
	component,
	...props
}: IconProps<T> & Omit<React.ComponentPropsWithoutRef<T>, keyof IconProps<T>>) {
	const Component = component || 'svg'
	return (
		<Component
			width={size}
			height={size}
			viewBox={viewBox}
			aria-hidden={!title}
			fill="transparent"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			{title && <title>{title}</title>}
			{Icons[name]()}
		</Component>
	)
}

Icon.defaultProps = {
	viewBox: '0 0 16 16',
	size: '16',
	role: 'img',
}

export default Icon
