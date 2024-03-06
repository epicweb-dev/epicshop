import { Link, useLoaderData } from '@remix-run/react'
import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
import { type MDXContentProps } from 'mdx-bundler/client'
import * as mdxBundler from 'mdx-bundler/client/index.js'
import { useEffect, useMemo, useState } from 'react'
import { AnchorOrLink, Heading, cn } from './misc.tsx'
import { VideoEmbed, DeferredEpicVideo } from '#app/components/epic-video.tsx'
import { Icon } from '#app/components/icons.tsx'
import { type loader } from '#app/routes/_app+/_exercises+/$exerciseNumber_.$stepNumber.$type+/_layout.tsx'
import { LaunchEditor } from '#app/routes/launch-editor.tsx'

const safePath = (s: string) => s.replace(/\\/g, '/')

function getRelativePath(file: string, separator: string, type?: string) {
	const [, relativePath] = file
		.replace(/\\|\//g, separator)
		.split(`${type === 'playground' ? 'example' : 'exercises'}${separator}`)
	return relativePath
}

const buttonClassName =
	'border-border bg-[var(--base00)] hover:bg-foreground/20 active:bg-foreground/30 box-content block rounded border-2 px-2 py-0.5 font-mono text-xs font-semibold outline-none transition duration-300 ease-in-out'

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
	'data-sep': separator = '/',
	'data-start': start,
	'data-type': type,
}: DataProps) {
	const data = useLoaderData<typeof loader>()

	if (type === 'other' || !buttons || !filename || !fullPath) return null

	const currentAppFullPath = safePath(data[data.type]?.fullPath ?? '')
	const isFileFromDifferentApp = !fullPath.startsWith(currentAppFullPath)
	const validButtons = ENV.KCDSHOP_DEPLOYED
		? (['problem', 'solution'] as const)
		: (['problem', 'solution', 'playground'] as const)
	const buttonList = buttons.split(',')
	const apps = validButtons.filter(button => buttonList.includes(button))

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
								className={clsx(buttonClassName, 'cursor-not-allowed')}
								title={
									isDifferentApp
										? 'Playground is not set to the right app'
										: isFileFromDifferentApp
											? 'This file is from different app'
											: "You must 'Set to Playground' before opening a file"
								}
							>
								<span className="uppercase">Open</span> in {type}
							</button>
						)
					}
				}

				if (!app || !app.fullPath) {
					// unexpected
					return null
				}

				const file = [safePath(app.fullPath), safePath(filename)].join(
					separator,
				)
				const fixedTitle = getRelativePath(file, separator, type)
				return (
					<LaunchEditor key={type} file={file} line={Number(start ?? 1)}>
						<span title={fixedTitle} className={buttonClassName}>
							<span className="uppercase">Open</span> in {type}
						</span>
					</LaunchEditor>
				)
			})}
		</>
	)
}

function CopyButton(): React.ReactNode {
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		if (copied) {
			const timeoutId = setTimeout(() => setCopied(false), 1500)
			return () => clearTimeout(timeoutId)
		}
	}, [copied])

	return (
		<button
			className={cn(buttonClassName, 'w-12 uppercase')}
			onClick={event => {
				setCopied(true)
				const button = event.currentTarget
				const code =
					button.parentElement?.parentElement?.querySelector('pre')
						?.textContent || ''
				void navigator.clipboard.writeText(code)
			}}
		>
			{copied ? 'copied' : 'copy'}
		</button>
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

	function updateFilename() {
		if (fullPath && separator) {
			if (!filename || filename.includes('..')) {
				return { 'data-filename': getRelativePath(fullPath, separator) }
			} else {
				return { 'data-filename': filename.replace(/\//g, separator) }
			}
		}
	}

	return (
		<div className="group relative">
			<div className="absolute right-0 top-0 z-50 m-2 flex items-baseline justify-end gap-4 opacity-0 transition duration-300 ease-in-out focus-within:opacity-100 group-hover:opacity-100">
				{buttons ? <OpenInEditor {...props} /> : null}
				{showCopyButton ? <CopyButton /> : null}
			</div>
			<pre
				{...props}
				className={clsx(
					'scrollbar-thin scrollbar-thumb-scrollbar',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
					props.className ?? '',
				)}
				{...updateFilename()}
			>
				{children}
			</pre>
		</div>
	)
}

export const mdxComponents = {
	h1: (props: any) => <Heading {...props} as="h1" />,
	h2: (props: any) => <Heading {...props} as="h2" />,
	h3: (props: any) => <Heading {...props} as="h3" />,
	h4: (props: any) => <Heading {...props} as="h4" />,
	h5: (props: any) => <Heading {...props} as="h5" />,
	h6: (props: any) => <Heading {...props} as="h6" />,
	a: AnchorOrLink,
	// you can't put a <form> inside a <p> so we'll just use a div
	// if this is a problem, then render the form outside of the MDX and update <LaunchEditor /> to reference that one instead or something.
	p: (props: any) => <div {...props} />,
	pre: (props: any) => (
		<pre
			{...props}
			className={clsx(
				'scrollbar-thin scrollbar-thumb-scrollbar',
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
				props.className ?? '',
			)}
		/>
	),
	LaunchEditor,
	VideoEmbed,
	EpicVideo: DeferredEpicVideo,
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
	return useMemo(() => {
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
	components: externalComponents,
}: {
	code: string
	components?: MDXContentProps['components']
}) {
	const Component = useMdxComponent(code)
	const components = useMemo(
		() => ({ Icon, pre: PreWithButtons, Link, ...externalComponents }),
		[externalComponents],
	)
	return <Component components={components} />
}
