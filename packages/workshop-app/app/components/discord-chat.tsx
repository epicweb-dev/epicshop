import * as React from 'react'
import { Await, Link } from 'react-router'
import { Icon } from '#app/components/icons.tsx'
import { Loading } from '#app/components/loading.tsx'
import { DiscordCTA, useDiscordCTALink } from '#app/routes/_app+/discord.tsx'
import { useAltDown } from '#app/utils/misc.tsx'
import { useIsOnline } from '#app/utils/online.ts'

type EmojiData = {
	emojiName?: string
	emojiUrl?: string
}

type DiscordTag = { name: string } & EmojiData
type DiscordReaction = { count: number } & EmojiData

export type DiscordThread = {
	id: string
	tags: DiscordTag[]
	name: string
	link: string
	authorDisplayName: string
	authorHexAccentColor?: string | null
	authorAvatarUrl: string | null
	messagePreview: string
	messageCount: number
	lastUpdated: string
	lastUpdatedDisplay: string
	previewImageUrl: string | null
	reactions: DiscordReaction[]
}

export function DiscordChat({
	discordPostsPromise,
}: {
	discordPostsPromise: Promise<DiscordThread[]>
}) {
	return (
		<div className="flex h-full w-full flex-col gap-4 pt-4">
			<div className="text-center">
				<DiscordCTA />
			</div>
			<div className="bg-accent scrollbar-thin scrollbar-thumb-scrollbar flex-1 overflow-y-scroll pb-4">
				<DiscordPosts discordPostsPromise={discordPostsPromise} />
			</div>
		</div>
	)
}

function DiscordPosts({
	discordPostsPromise,
}: {
	discordPostsPromise: Promise<DiscordThread[]>
}) {
	const ctaLink = useDiscordCTALink()
	const altDown = useAltDown()
	const isOnline = useIsOnline()
	if (!isOnline) {
		return (
			<div className="flex h-full flex-col items-center justify-between">
				<div className="text-foreground-destructive flex h-full w-full flex-col items-center justify-center">
					<Icon name="WifiNoConnection" size="xl">
						Unable to load discord messages when offline
					</Icon>
				</div>
			</div>
		)
	}
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
					resolve={discordPostsPromise}
					errorElement={
						<div className="text-foreground-destructive">
							There was a problem loading the discord posts
						</div>
					}
				>
					{(posts) => (
						<ul className="flex w-full flex-col gap-4 p-3 xl:p-12">
							{posts.map((post) => (
								<li
									key={post.id}
									className="bg-background rounded-xl border transition-all duration-200 focus-within:-translate-y-1 focus-within:shadow-lg hover:-translate-y-1 hover:shadow-lg"
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
							? (event) => {
									event.preventDefault()
									window.open(
										event.currentTarget.href,
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

function DiscordPost({ thread }: { thread: DiscordThread }) {
	const reactionsWithCounts = thread.reactions.filter(
		(reaction) => reaction.count,
	)

	return (
		<div>
			<div className="flex flex-col gap-2 p-4">
				<div className="flex min-w-0 gap-4">
					<div className="flex min-w-0 flex-col gap-1">
						{thread.tags.length ? (
							<div className="flex gap-2">
								{thread.tags.map((tag) => (
									<div
										key={`${tag.name}-${tag.emojiName ?? tag.emojiUrl ?? 'tag'}`}
										className="bg-accent flex items-center justify-center gap-1 rounded-full px-2 py-1 text-sm"
									>
										<span className="h-3 w-3 leading-3">
											<Emoji name={tag.emojiName} url={tag.emojiUrl} />
										</span>
										<span>{tag.name}</span>
									</div>
								))}
							</div>
						) : null}
						<strong className="text-xl font-bold">{thread.name}</strong>
						<div className="flex min-w-0 flex-col gap-1">
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
							<span className="text-muted-foreground line-clamp-4 min-w-0">
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
									{reactionsWithCounts.map((reaction, index) => (
										<li
											key={`${reaction.emojiName ?? reaction.emojiUrl ?? 'reaction'}-${index}`}
											className="border-info/60 bg-info/10 text-info flex items-center gap-1 rounded-md border px-[5px] py-[0.5px] text-sm"
										>
											<span className="h-3 w-3 leading-3">
												<Emoji
													name={reaction.emojiName}
													url={reaction.emojiUrl}
												/>
											</span>
											<span>{reaction.count}</span>
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
