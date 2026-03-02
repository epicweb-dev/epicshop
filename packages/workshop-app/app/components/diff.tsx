import * as Accordion from '@radix-ui/react-accordion'
import { parsePatchFiles, registerCustomCSSVariableTheme } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import * as Select from '@radix-ui/react-select'
import { clsx } from 'clsx'
import React, { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import {
	Await,
	Form,
	Link,
	useNavigation,
	useSearchParams,
	useSubmit,
} from 'react-router'
import { useSpinDelay } from 'spin-delay'
import { useTheme } from '#app/routes/theme/index.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useApps } from '#app/utils/root-loader.ts'
import { DeferredEpicVideo } from './epic-video.tsx'
import { Icon } from './icons.tsx'
import { useRevalidationWS } from './revalidation-ws.tsx'
import { SimpleTooltip } from './ui/tooltip.tsx'

type diffProp = {
	app1?: string
	app2?: string
	diffPatch?: string | null
}

type ParsedDiffFile = ReturnType<typeof parsePatchFiles>[number]['files'][number]
type DiffFileVariant = 'changed' | 'added' | 'deleted' | 'renamed'

const diffThemeNameLight = 'epic-base16-light'
const diffThemeNameDark = 'epic-base16-dark'
const diffThemeDefaults = {
	foreground: 'var(--base05)',
	background: 'var(--base00)',
	'token-link': 'var(--base0D)',
	'token-string': 'var(--base0B)',
	'token-comment': 'var(--base03)',
	'token-constant': 'var(--base08)',
	'token-keyword': 'var(--base0A)',
	'token-parameter': 'var(--base08)',
	'token-function': 'var(--base0D)',
	'token-string-expression': 'var(--base0C)',
	'token-punctuation': 'var(--base0E)',
	'token-inserted': 'var(--diff-color-added)',
	'token-deleted': 'var(--diff-color-deleted)',
	'token-changed': 'var(--diff-color-modified)',
	'ansi-green': 'var(--diff-color-added)',
	'ansi-red': 'var(--diff-color-deleted)',
	'ansi-blue': 'var(--diff-color-modified)',
} satisfies Record<string, string>
registerCustomCSSVariableTheme(diffThemeNameLight, diffThemeDefaults)
registerCustomCSSVariableTheme(diffThemeNameDark, diffThemeDefaults)

function getDiffFileValue(fileDiff: ParsedDiffFile) {
	return `${fileDiff.prevName ?? ''}::${fileDiff.name}`
}

function getDiffFileTitle(fileDiff: ParsedDiffFile) {
	if (fileDiff.prevName && fileDiff.prevName !== fileDiff.name) {
		return `${fileDiff.prevName} -> ${fileDiff.name}`
	}
	return fileDiff.name
}

function getDiffFileVariant(fileDiff: ParsedDiffFile): DiffFileVariant {
	switch (fileDiff.type) {
		case 'new':
			return 'added'
		case 'deleted':
			return 'deleted'
		case 'rename-pure':
		case 'rename-changed':
			return 'renamed'
		default:
			return 'changed'
	}
}

function getDiffFileIcon(fileDiff: ParsedDiffFile) {
	const variant = getDiffFileVariant(fileDiff)
	switch (variant) {
		case 'added':
			return 'Added' as const
		case 'deleted':
			return 'Deleted' as const
		case 'renamed':
			return 'Renamed' as const
		default:
			return 'Modified' as const
	}
}

function getDiffFileIconClass(fileDiff: ParsedDiffFile) {
	const variant = getDiffFileVariant(fileDiff)
	switch (variant) {
		case 'added':
			return 'text-[var(--diff-color-added)]'
		case 'deleted':
			return 'text-[var(--diff-color-deleted)]'
		case 'renamed':
			return 'text-[var(--diff-color-renamed)]'
		case 'changed':
		default:
			return 'text-[var(--diff-color-modified)]'
	}
}

function getDiffLineCounts(fileDiff: ParsedDiffFile) {
	return fileDiff.hunks.reduce(
		(acc, hunk) => ({
			added: acc.added + hunk.additionCount,
			deleted: acc.deleted + hunk.deletionCount,
		}),
		{ added: 0, deleted: 0 },
	)
}

function RevalidateApps({
	app1: app1Name,
	app2: app2Name,
}: {
	app1?: string
	app2?: string
}) {
	const apps = useApps()
	const app1 = apps.find((app) => app.name === app1Name)
	const app2 = apps.find((app) => app.name === app2Name)

	useRevalidationWS({
		watchPaths: [app1?.fullPath, app2?.fullPath].filter(Boolean),
	})
	return null
}

export function UserHasAccessDiff({
	userHasAccessPromise,
	diff,
	allApps,
}: {
	userHasAccessPromise: Promise<boolean>
	diff: Promise<diffProp> | diffProp
	allApps: Array<{ name: string; displayName: string }>
}) {
	return (
		<ErrorBoundary
			fallbackRender={() => (
				<div className="w-full p-12">
					<div className="flex w-full flex-col gap-4 text-center">
						<p className="text-2xl font-bold">Error</p>
						<p className="text-lg">
							There was an error loading the user access.
						</p>
					</div>
				</div>
			)}
		>
			<Suspense
				fallback={
					<div className="flex items-center justify-center p-8">
						<SimpleTooltip content="Loading user access">
							<Icon name="Refresh" className="animate-spin" />
						</SimpleTooltip>
					</div>
				}
			>
				<Await resolve={userHasAccessPromise}>
					{(userHasAccess) =>
						userHasAccess ? (
							<DiffImplementation diff={diff} allApps={allApps} />
						) : (
							<div className="w-full p-12">
								<div className="flex w-full flex-col gap-4 text-center">
									<p className="text-2xl font-bold">Access Denied</p>
									<p className="text-lg">
										You must login or register for the workshop to view the
										diff.
									</p>
								</div>
								<div className="h-16" />
								<p className="pb-4">
									Check out this video to see how the diff tab works.
								</p>
								<DeferredEpicVideo url="https://www.epicweb.dev/tips/epic-workshop-diff-tab-demo" />
							</div>
						)
					}
				</Await>
			</Suspense>
		</ErrorBoundary>
	)
}

export { UserHasAccessDiff as Diff }

export function DiffImplementation({
	diff,
	allApps,
}: {
	diff: Promise<diffProp> | diffProp
	allApps: Array<{ name: string; displayName: string }>
}) {
	const submit = useSubmit()
	const [params] = useSearchParams()
	const paramsWithForcedRefresh = new URLSearchParams(params)
	paramsWithForcedRefresh.set('forceFresh', 'diff')
	const navigation = useNavigation()
	const spinnerNavigating = useSpinDelay(navigation.state !== 'idle', {
		delay: 0,
		minDuration: 1000,
	})
	const [openFileDiffs, setOpenFileDiffs] = React.useState<Array<string>>([])
	const theme = useTheme()
	const fileDiffOptions = {
		theme: {
			light: diffThemeNameLight,
			dark: diffThemeNameDark,
		},
		themeType: theme,
		diffStyle: 'unified' as const,
		hunkSeparators: 'line-info' as const,
		overflow: 'scroll' as const,
		disableFileHeader: true,
	}

	const hiddenInputs: Array<React.ReactNode> = []
	for (const [key, value] of params.entries()) {
		if (key === 'app1' || key === 'app2') continue
		hiddenInputs.push(
			<input key={key} type="hidden" name={key} value={value} />,
		)
	}

	return (
		<Suspense
			fallback={
				<div className="flex items-center justify-center p-8">
					<SimpleTooltip content="Loading diff">
						<Icon name="Refresh" className="animate-spin" />
					</SimpleTooltip>
				</div>
			}
		>
			<Await
				resolve={diff}
				errorElement={
					<p className="text-foreground-destructive p-6">
						There was an error calculating the diff. Sorry.
					</p>
				}
			>
				{(diff) => {
					let parsedDiffFiles: Array<ParsedDiffFile> = []
					let hasPatchParseError = false

					if (diff.diffPatch) {
						try {
							parsedDiffFiles = parsePatchFiles(diff.diffPatch).flatMap(
								(parsedPatch) => parsedPatch.files,
							)
						} catch {
							hasPatchParseError = true
						}
					}

					return (
						<div className="flex h-full w-full flex-col">
							<div className="flex h-14 min-h-14 w-full overflow-x-hidden border-b">
								<div className="border-r">
									<SimpleTooltip content="Reload diff">
										<Link
											to={`.?${paramsWithForcedRefresh}`}
											className="flex h-full w-14 items-center justify-center"
										>
											<Icon
												name="Refresh"
												className={cn({ 'animate-spin': spinnerNavigating })}
											/>
										</Link>
									</SimpleTooltip>
								</div>
								<Form
									onChange={(e) => submit(e.currentTarget)}
									className="scrollbar-thin scrollbar-thumb-scrollbar flex h-full flex-1 items-center overflow-x-auto"
									key={`${diff.app1}${diff.app2}`}
								>
									{hiddenInputs}
									<SelectFileToDiff
										name="app1"
										label="App 1"
										className="border-r"
										allApps={allApps}
										defaultValue={diff.app1}
									/>
									<SelectFileToDiff
										name="app2"
										label="App 2"
										allApps={allApps}
										defaultValue={diff.app2}
									/>
								</Form>
							</div>
							<div className="scrollbar-thin scrollbar-thumb-scrollbar grow overflow-y-scroll">
								{hasPatchParseError ? (
									<p className="bg-foreground text-background m-5 inline-flex items-center justify-center px-1 py-0.5 font-mono text-sm uppercase">
										There was a problem rendering the diff
									</p>
								) : parsedDiffFiles.length ? (
									<Accordion.Root
										type="multiple"
										value={openFileDiffs}
										onValueChange={setOpenFileDiffs}
										className="w-full"
									>
										{parsedDiffFiles.map((fileDiff, index) => {
											const fileValue = getDiffFileValue(fileDiff)
											const lineCounts = getDiffLineCounts(fileDiff)

											return (
												<Accordion.Item
													key={`${fileValue}:${index}`}
													value={fileValue}
													className="border-b"
												>
													<Accordion.Header>
														<Accordion.Trigger className="group hover:bg-foreground/10 flex w-full items-center justify-between gap-3 px-4 py-2 text-left">
															<span className="flex min-w-0 items-center gap-2 font-mono text-sm">
																<Icon
																	name={getDiffFileIcon(fileDiff)}
																	className={cn(
																		'shrink-0',
																		getDiffFileIconClass(fileDiff),
																	)}
																/>
																<span className="truncate">
																	{getDiffFileTitle(fileDiff)}
																</span>
															</span>
															<span className="text-muted-foreground flex shrink-0 items-center gap-2 font-mono text-xs">
																<span>-{lineCounts.deleted}</span>
																<span>+{lineCounts.added}</span>
																<Icon
																	name="TriangleDownSmall"
																	className="group-radix-state-open:rotate-180 transition"
																	aria-hidden
																/>
															</span>
														</Accordion.Trigger>
													</Accordion.Header>
													<Accordion.Content className="radix-state-closed:hidden">
														<FileDiff fileDiff={fileDiff} options={fileDiffOptions} />
													</Accordion.Content>
												</Accordion.Item>
											)
										})}
									</Accordion.Root>
								) : diff.diffPatch === '' ? (
									<p className="bg-foreground text-background m-5 inline-flex items-center justify-center px-1 py-0.5 font-mono text-sm uppercase">
										No changes
									</p>
								) : diff.app1 && diff.app2 ? (
									<p className="bg-foreground text-background m-5 inline-flex items-center justify-center px-1 py-0.5 font-mono text-sm uppercase">
										There was a problem generating the diff
									</p>
								) : (
									<p className="bg-foreground text-background m-5 inline-flex items-center justify-center px-1 py-0.5 font-mono text-sm uppercase">
										Select two apps to compare
									</p>
								)}
							</div>
							<RevalidateApps app1={diff.app1} app2={diff.app2} />
						</div>
					)
				}}
			</Await>
		</Suspense>
	)
}

function SelectFileToDiff({
	name,
	label,
	className,
	allApps,
	defaultValue,
}: {
	name: string
	label: string
	className?: string
	allApps: Array<{ name: string; displayName: string }>
	defaultValue?: string
}) {
	return (
		<Select.Root name={name} defaultValue={defaultValue}>
			<Select.Trigger
				className={clsx(
					'radix-placeholder:text-muted-foreground flex h-full w-full max-w-[50%] items-center justify-between px-3 text-left focus-visible:outline-none',
					className,
				)}
				aria-label={`Select ${label} for git Diff`}
			>
				<span className="truncate">
					{label}:{' '}
					<Select.Value
						placeholder={`Select ${label}`}
						className="inline-block w-40 truncate"
					/>
				</span>
				<Select.Icon className="">
					<Icon name="TriangleDownSmall" />
				</Select.Icon>
			</Select.Trigger>
			<Select.Portal>
				<Select.Content
					position="popper"
					align="start"
					className="bg-popover text-popover-foreground z-20 max-h-[50vh] lg:max-h-[70vh]"
				>
					<Select.ScrollUpButton className="flex h-5 cursor-default items-center justify-center">
						<Icon name="ChevronUp" />
					</Select.ScrollUpButton>
					<Select.Viewport className="p-3">
						<Select.Group>
							<Select.Label className="px-5 pb-3 font-mono uppercase">
								{label}
							</Select.Label>
							{allApps.map((app) => {
								return (
									<SelectItem key={app.name} value={app.name}>
										{app.displayName}
									</SelectItem>
								)
							})}
						</Select.Group>
					</Select.Viewport>
					<Select.ScrollDownButton className="flex h-5 cursor-default items-center justify-center">
						<Icon name="ChevronDown" />
					</Select.ScrollDownButton>
				</Select.Content>
			</Select.Portal>
		</Select.Root>
	)
}

const SelectItem: React.FC<any> = ({
	ref: forwardedRef,
	children,
	className,
	...props
}) => {
	return (
		<Select.Item
			className={clsx(
				'radix-disabled:text-muted-foreground radix-highlighted:opacity-100 radix-highlighted:outline-none radix-state-checked:opacity-100 relative flex cursor-pointer items-center rounded px-10 py-2 leading-none opacity-80 select-none',

				className,
			)}
			{...props}
			ref={forwardedRef}
		>
			<Select.ItemText>{children}</Select.ItemText>
			<Select.ItemIndicator className="absolute left-0 inline-flex w-[25px] items-center justify-center">
				<Icon name="CheckSmall" />
			</Select.ItemIndicator>
		</Select.Item>
	)
}
