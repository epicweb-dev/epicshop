import { type SerializeFrom } from '@remix-run/node'
import { Await, Link, useLoaderData } from '@remix-run/react'
import * as React from 'react'
import { Icon } from '#app/components/icons.tsx'
import { Loading } from '#app/components/loading.tsx'
import { useHints } from '#app/utils/client-hints.tsx'
import { useAltDown } from '#app/utils/misc.tsx'
import { DiscordCTA, useDiscordCTALink } from '../../../discord.tsx'
import { type loader } from '../index.tsx'

export function DiscordChat() {
	const data = useLoaderData<typeof loader>()
	return (
		<div className="flex h-full w-full flex-col gap-4 pt-4">
			<div className="text-center">
				<DiscordCTA discordAuthUrl={data.discordAuthUrl} />
			</div>
			<div className="flex-1 overflow-y-scroll bg-accent pb-4 scrollbar-thin scrollbar-thumb-scrollbar">
				<DiscordPosts />
			</div>
		</div>
	)
}

function DiscordPosts() {
	const data = useLoaderData<typeof loader>()
	const ctaLink = useDiscordCTALink({ discordAuthUrl: data.discordAuthUrl })
	const altDown = useAltDown()
	return (
		<div className="flex h-full flex-col items-center justify-between">
			<React.Suspense
				fallback={
					<div className="flex h-full w-full flex-col items-center justify-center">
						<Loading>Loading Discord Posts</Loading>
					</div>
				}
			>
				<Await
					resolve={data.discordPostsPromise}
					errorElement={
						<div className="text-red-500">
							There was a problem loading the discord posts
						</div>
					}
				>
					{(posts) => (
						<ul className="flex w-full flex-col gap-4 p-3 xl:p-12">
							{posts.map((post) => (
								<li
									key={post.id}
									className="rounded-xl border bg-background transition-all duration-200 focus-within:-translate-y-1 focus-within:shadow-lg hover:-translate-y-1 hover:shadow-lg"
								>
									<DiscordPost thread={post} />
								</li>
							))}
						</ul>
					)}
				</Await>
			</React.Suspense>
			<div>
				<Link
					to={
						altDown && !ctaLink.includes('oauth')
							? ctaLink.replace(/^https/, 'discord')
							: ctaLink
					}
					target={ctaLink.includes('oauth') ? undefined : '_blank'}
					rel="noreferrer noopener"
					onClick={
						altDown
							? (e) => {
									e.preventDefault()
									window.open(
										e.currentTarget.href,
										'_blank',
										'noreferrer noopener',
									)
								}
							: undefined
					}
					className="flex items-center gap-2 p-2 text-xl hover:underline"
				>
					Create Post <Icon name="ExternalLink" />
				</Link>
			</div>
		</div>
	)
}

function DiscordPost({
	thread,
}: {
	thread: Awaited<SerializeFrom<typeof loader>['discordPostsPromise']>[number]
}) {
	const reactionsWithCounts = thread.reactions.filter((r) => r.count)
	const hints = useHints()

	return (
		<div>
			<div className="flex flex-col gap-2 p-4">
				<div className="flex gap-4">
					<div className="flex flex-col gap-1">
						{thread.tags.length ? (
							<div className="flex gap-2">
								{thread.tags.map((t) => (
									<div
										key={t.name}
										className="flex items-center justify-center gap-1 rounded-full bg-accent px-2 py-1 text-sm"
									>
										<span className="h-3 w-3 leading-3">
											{/* not sure how to fix this one... */}
											{/* @ts-expect-error */}
											<Emoji name={t.emojiName} url={t.emojiUrl} />
										</span>
										<span>{t.name}</span>
									</div>
								))}
							</div>
						) : null}
						<strong className="text-xl font-bold">{thread.name}</strong>
						<div className="flex items-start gap-1">
							<div className="flex items-center gap-1">
								{thread.authorAvatarUrl ? (
									<img
										src={thread.authorAvatarUrl}
										alt=""
										className="h-6 w-6 rounded-full"
									/>
								) : null}
								<span>
									<span
										className="font-bold"
										style={
											thread.authorHexAccentColor
												? { color: thread.authorHexAccentColor }
												: {}
										}
									>
										{thread.authorDisplayName}
									</span>
									:{' '}
								</span>
							</div>
							<span className="flex-1 overflow-ellipsis text-muted-foreground">
								{thread.messagePreview}
							</span>
						</div>
					</div>
					{thread.previewImageUrl ? (
						<img
							src={thread.previewImageUrl}
							alt=""
							className="h-28 w-28 rounded-lg object-cover"
						/>
					) : null}
				</div>

				<div className="flex justify-between">
					<div className="flex items-center gap-3">
						<span>
							{reactionsWithCounts.length ? (
								<ul className="flex items-center gap-2">
									{reactionsWithCounts.map((r, i) => (
										<li
											key={i}
											className="flex items-center gap-1 rounded-md border border-blue-600 bg-blue-500/20 px-[5px] py-[0.5px] text-sm"
										>
											<span className="h-3 w-3 leading-3">
												{/* not sure how to fix this one... */}
												{/* @ts-expect-error */}
												<Emoji name={r.emojiName} url={r.emojiUrl} />
											</span>
											<span>{r.count}</span>
										</li>
									))}
								</ul>
							) : null}
						</span>
						<span className="flex items-center gap-1">
							<span className="inline-flex items-center gap-1">
								<Icon name="Chat" /> {thread.messageCount}
							</span>
							{` · ${thread.lastUpdatedDisplay}`}
						</span>
					</div>
					<span className="flex items-center gap-4">
						<a href={thread.link.replace(/^https/, 'discord')}>
							<Icon name="Discord" />
						</a>
						<a href={thread.link} target="_blank" rel="noreferrer noopener">
							<Icon name="ExternalLink" />
						</a>
					</span>
				</div>
			</div>
		</div>
	)
}

function Emoji({ name, url }: { name?: string; url?: string }) {
	return url ? (
		<img src={url} alt={name} className="h-full w-full" />
	) : name ? (
		name
	) : null
}
