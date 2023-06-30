import { LRUCache } from 'lru-cache'
import * as mdxBundler from 'mdx-bundler/client/index.js'
import type { MDXContentProps } from 'mdx-bundler/client'
import * as React from 'react'
import { LaunchEditor } from '~/routes/launch-editor.tsx'
import { AnchorOrLink } from './misc.tsx'

function notification(button: EventTarget & HTMLButtonElement, on?: boolean) {
	if (button) {
		const label = button.previousElementSibling
		if (on) label?.removeAttribute('hidden')
		else label?.setAttribute('hidden', 'true')
		button.style.backgroundColor = on ? 'hsl(var(--foreground))' : ''
		button.style.color = on ? 'hsl(var(--background))' : ''
	}
}

export function PreWithCopyToClipboard({ children, ...props }: any) {
	const showCopyButton = !Object.keys(props).find(att => att === 'data-nocopy')

	return (
		<div className="group relative">
			{showCopyButton ? (
				<div className="absolute right-0 top-0 z-50 m-2 mr-2 flex items-center gap-2 opacity-0 transition duration-300 ease-in-out focus-within:opacity-100 group-hover:opacity-100">
					<span hidden className="font-mono text-xs uppercase">
						copied
					</span>
					<button
						className="border-border hover:bg-foreground/20 active:bg-foreground/30 rounded border-2 px-2 py-0.5 font-mono text-xs font-semibold uppercase outline-none transition duration-300 ease-in-out"
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
const mdxComponentCache = new LRUCache<
	string,
	ReturnType<typeof getMdxComponent>
>({ max: 1000 })

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
