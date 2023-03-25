import LRU from 'lru-cache'
import * as mdxBundler from 'mdx-bundler/client'
import type { MDXContentProps } from 'mdx-bundler/client'
import * as React from 'react'
import { LaunchEditor } from '~/routes/launch-editor'
import { AnchorOrLink } from './misc'
import Accordion from '~/components/accordion'

function notification(button: EventTarget & HTMLButtonElement, on?: boolean) {
	if (button) {
		const label = button.previousElementSibling
		if (on) label?.removeAttribute('hidden')
		else label?.setAttribute('hidden', 'true')
		button.style.backgroundColor = on ? '#e5e5e5' /* bg-gray-200 */ : ''
	}
}

export function PreWithCopyToClipboard({ children, ...props }: any) {
	const showCopyButton = !Object.keys(props).find(att => att === 'data-nocopy')

	return (
		<div className="group relative">
			{showCopyButton ? (
				<div className="absolute top-0 right-0 z-50 m-2 mr-2 flex items-center gap-2 opacity-0 transition duration-300 ease-in-out group-hover:opacity-100">
					<span hidden className="font-mono text-xs uppercase text-black">
						copied
					</span>
					<button
						className="rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-xs font-semibold uppercase text-black transition duration-300 ease-in-out hover:bg-gray-100 active:bg-gray-200"
						onClick={event => {
							const button = event.currentTarget
							notification(button, true)
							setTimeout(() => notification(button), 1500)
							const code =
								button.parentElement?.parentElement?.querySelector('pre')
									?.textContent || ''
							navigator.clipboard.writeText(code)
						}}
					>
						copy
					</button>
				</div>
			) : null}
			<pre {...props}>{children}</pre>
		</div>
	)
}

export const mdxComponents = {
	a: AnchorOrLink,
	// you can't put a <form> inside a <p> so we'll just use a div
	// if this is a problem, then render the form outside of the MDX and update <LaunchEditor /> to reference that one instead or something.
	p: (props: any) => <div {...props} />,
	LaunchEditor,
	Accordion: (props: any) => <Accordion {...props} />,
}

/**
 * This should be rendered within a useMemo
 * @param code the code to get the component from
 * @returns the component
 */
function getMdxComponent(code: string) {
	const Component = mdxBundler.getMDXComponent(code)
	function KCDMdxComponent({
		components,
		...rest
	}: Parameters<typeof Component>['0']) {
		return (
			// @ts-expect-error the types are wrong here
			<Component components={{ ...mdxComponents, ...components }} {...rest} />
		)
	}
	return KCDMdxComponent
}

// This exists so we don't have to call new Function for the given code
// for every request for a given blog post/mdx file.
const mdxComponentCache = new LRU<string, ReturnType<typeof getMdxComponent>>({
	max: 1000,
})

export function useMdxComponent(code: string) {
	return React.useMemo(() => {
		if (mdxComponentCache.has(code)) {
			return mdxComponentCache.get(code)!
		}
		const component = getMdxComponent(code)
		mdxComponentCache.set(code, component)
		return component
	}, [code])
}

export function Mdx({
	code,
	components,
}: {
	code: string
	components?: MDXContentProps['components']
}) {
	const Component = useMdxComponent(code)
	return <Component components={components} />
}
