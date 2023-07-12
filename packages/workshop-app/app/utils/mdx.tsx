import path from 'node:path'
import { LRUCache } from 'lru-cache'
import * as mdxBundler from 'mdx-bundler/client/index.js'
import type { MDXContentProps } from 'mdx-bundler/client'
import * as React from 'react'
import { LaunchEditor } from '~/routes/launch-editor.tsx'
import { AnchorOrLink } from './misc.tsx'
import { useLoaderData } from '@remix-run/react'
import { type loader } from '~/routes/_app+/_exercises+/$exerciseNumber_.$stepNumber.$type.tsx'
import { clsx } from 'clsx'

const safePath = (s: string) => s.replace(/\\/g, '/')

function getRelativePath(file: string, separator?: string, type?: string) {
	const [, relativePath] = file
		.replace(/\\|\//g, separator ?? path.sep)
		.split(`${type === 'playground' ? 'example' : 'exercises'}${separator}`)
	return relativePath
}

type DataProps = {
	'data-buttons'?: string
	'data-filename'?: string
	'data-fullpath'?: string
	'data-nocopy'?: string
	'data-sep'?: string
	'data-start'?: string
	'data-type'?: string
}

function OpenInEditor({
	'data-buttons': buttons,
	'data-filename': filename,
	'data-fullpath': fullPath,
	'data-sep': separator,
	'data-start': start,
	'data-type': type,
}: DataProps) {
	const data = useLoaderData<typeof loader>()

	if (type === 'other' || !buttons || !filename || !fullPath) return null

	const currentAppFullPath = safePath(data[data.type]?.fullPath ?? '')
	const isFileFromDifferentApp = !fullPath.startsWith(currentAppFullPath)

	const validButtons = ['problem', 'solution', 'playground'] as const
	const buttonList = buttons.split(',')
	const apps = validButtons.filter(button =>
		buttonList.includes(button),
	) as (typeof validButtons)[number][]

	const className =
		'border-border hover:bg-foreground/20 active:bg-foreground/30 box-content block rounded border-2 px-2 py-0.5 font-mono text-xs font-semibold outline-none transition duration-300 ease-in-out'
	return (
		<>
			{apps.map(type => {
				const app = data[type]
				if (type === 'playground') {
					const isDifferentApp =
						data.playground && data.playground.appName !== data.problem?.name
					if (!app || isDifferentApp || isFileFromDifferentApp) {
						return (
							<button
								key={type}
								className={clsx(className, 'mt-1 cursor-not-allowed')}
								title={
									isDifferentApp
										? 'Playground is not set to the right app'
										: isFileFromDifferentApp
										? 'This file is form different app'
										: "You must 'Set to Playground' before opening a file"
								}
							>
								OPEN in {type}
							</button>
						)
					}
				}

				if (!app || !app.fullPath) {
					// unexpected
					return null
				}

				const file = path.join(safePath(app.fullPath), safePath(filename))
				const fixedTitle = getRelativePath(file, separator, type)
				return (
					<LaunchEditor key={type} file={file} line={Number(start ?? 1)}>
						<span title={fixedTitle} className={className}>
							OPEN in {type}
						</span>
					</LaunchEditor>
				)
			})}
		</>
	)
}

function notification(button: EventTarget & HTMLButtonElement, on?: boolean) {
	if (button) {
		const label = button.previousElementSibling
		label?.classList[on ? 'add' : 'remove']('visible')
		label?.classList[on ? 'remove' : 'add']('collapse')
		button.style.backgroundColor = on ? 'hsl(var(--foreground))' : ''
		button.style.color = on ? 'hsl(var(--background))' : ''
	}
}

function CopyButton(): React.ReactNode {
	return (
		<>
			<span className="collapse font-mono text-xs uppercase">copied</span>
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
		</>
	)
}

export function PreWithButtons({ children, ...props }: any) {
	const {
		'data-buttons': buttons,
		'data-filename': filename,
		'data-fullpath': fullPath,
		'data-nocopy': hideCopyButton,
		'data-sep': separator,
	} = props as DataProps
	const showCopyButton = hideCopyButton === undefined

	const updateFilename = () => {
		if (fullPath && separator) {
			if (!filename || filename.includes('..')) {
				props['data-filename'] = getRelativePath(fullPath, separator)
			} else {
				props['data-filename'] = filename.replace(/\//g, separator)
			}
		}
		return props
	}

	return (
		<div className="group relative">
			{buttons ? (
				<div className="absolute right-28 top-4 z-50 m-2 my-0.5 flex items-center gap-4 opacity-0 transition duration-300 ease-in-out focus-within:opacity-100 group-hover:opacity-100">
					<OpenInEditor {...props} />
				</div>
			) : null}
			{showCopyButton ? (
				<div
					className={clsx(
						'absolute right-0 top-0 z-50 m-2 flex items-center gap-2 opacity-0 transition duration-300 ease-in-out focus-within:opacity-100 group-hover:opacity-100',
						{
							'top-0': !buttons,
							'top-4': buttons,
						},
					)}
				>
					<CopyButton />
				</div>
			) : null}
			<pre {...updateFilename()}>{children}</pre>
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
