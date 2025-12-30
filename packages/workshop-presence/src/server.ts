import type * as Party from 'partykit/server'
import { z } from 'zod'
import {
	getProductHostEmoji,
	productHostEmojis,
	UserSchema,
	type RepoStatus,
} from './presence.ts'

// Cache for latest npm version
let latestNpmVersionCache: { version: string | null; fetchedAt: number } = {
	version: null,
	fetchedAt: 0,
}
const NPM_VERSION_CACHE_TTL = 1000 * 60 * 5 // 5 minutes

async function getLatestNpmVersion(): Promise<string | null> {
	const now = Date.now()
	if (
		latestNpmVersionCache.version &&
		now - latestNpmVersionCache.fetchedAt < NPM_VERSION_CACHE_TTL
	) {
		return latestNpmVersionCache.version
	}

	try {
		const response = await fetch(
			'https://registry.npmjs.org/@epic-web/workshop-app/latest',
		)
		if (!response.ok) return latestNpmVersionCache.version
		const data = (await response.json()) as { version?: string }
		if (data.version) {
			latestNpmVersionCache = { version: data.version, fetchedAt: now }
			return data.version
		}
	} catch {
		// Return cached version on error
	}
	return latestNpmVersionCache.version
}

type User = z.infer<typeof UserSchema>
const ConnectionStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
	})
	.nullable()

type ConnectionState = z.infer<typeof ConnectionStateSchema>

const MessageSchema = z
	.object({
		type: z.literal('remove-user'),
		payload: z.object({ id: z.string() }),
	})
	.or(z.object({ type: z.literal('add-user'), payload: UserSchema }))
	.or(
		z.object({
			type: z.literal('add-anonymous-user'),
			payload: z.object({ id: z.string() }),
		}),
	)
	.or(
		z.object({
			type: z.literal('presence'),
			payload: z.object({ users: z.array(UserSchema) }),
		}),
	)
type Message = z.infer<typeof MessageSchema>

export default (class Server implements Party.Server {
	options: Party.ServerOptions = {
		hibernate: true,
	}

	readonly party: Party.Room

	constructor(party: Party.Room) {
		this.party = party
	}

	onClose() {
		this.updateUsers()
	}

	onError() {
		this.updateUsers()
	}

	updateUsers() {
		const presenceMessage = JSON.stringify(this.getPresenceMessage())
		for (const connection of this.party.getConnections()) {
			connection.send(presenceMessage)
		}
	}

	getPresenceMessage() {
		return {
			type: 'presence',
			payload: { users: this.getUsers() },
		} satisfies Message
	}

	getUsers() {
		const users = new Map<string, z.infer<typeof UserSchema>>()

		for (const connection of this.party.getConnections()) {
			const state = getConnectionState(connection)
			if (state?.user) {
				const existingUser = users.get(state.user.id)
				if (existingUser) {
					// Aggregate locations from multiple connections
					const existingLocations =
						existingUser.locations ??
						(existingUser.location ? [existingUser.location] : [])
					const newLocation = state.user.location
					if (newLocation) {
						// Check if this location is already in the list (by workshopTitle)
						const isDuplicate = existingLocations.some(
							(loc) =>
								loc.workshopTitle === newLocation.workshopTitle &&
								loc.exercise?.exerciseNumber ===
									newLocation.exercise?.exerciseNumber &&
								loc.exercise?.stepNumber === newLocation.exercise?.stepNumber,
						)
						if (!isDuplicate) {
							existingUser.locations = [...existingLocations, newLocation]
						}
					}
					// Merge other user properties (take the most complete version)
					if (!existingUser.name && state.user.name)
						existingUser.name = state.user.name
					if (!existingUser.imageUrlSmall && state.user.imageUrlSmall)
						existingUser.imageUrlSmall = state.user.imageUrlSmall
					if (!existingUser.imageUrlLarge && state.user.imageUrlLarge)
						existingUser.imageUrlLarge = state.user.imageUrlLarge
					if (!existingUser.avatarUrl && state.user.avatarUrl)
						existingUser.avatarUrl = state.user.avatarUrl
					if (state.user.hasAccess) existingUser.hasAccess = true
					// Merge loggedInProductHosts
					if (state.user.loggedInProductHosts?.length) {
						const existingHosts = new Set(
							existingUser.loggedInProductHosts ?? [],
						)
						for (const host of state.user.loggedInProductHosts) {
							existingHosts.add(host)
						}
						existingUser.loggedInProductHosts = Array.from(existingHosts)
					}
				} else {
					// First connection for this user - initialize locations array from location
					const user = { ...state.user }
					if (user.location) {
						user.locations = [user.location]
					}
					users.set(user.id, user)
				}
			}
		}

		// Ensure backward compatibility: set `location` to first location for old clients
		const userList = Array.from(users.values()).map((user) => {
			if (user.locations && user.locations.length > 0 && !user.location) {
				return { ...user, location: user.locations[0] }
			}
			return user
		})

		return sortUsers(userList)
	}

	onMessage(message: string, sender: Party.Connection) {
		const result = MessageSchema.safeParse(JSON.parse(message))
		if (!result.success) return

		if (result.data.type === 'add-user') {
			shallowMergeConnectionState(sender, { user: result.data.payload })
			this.updateUsers()
		} else if (result.data.type === 'remove-user') {
			setConnectionState(sender, null)
			this.updateUsers()
		} else if (result.data.type === 'add-anonymous-user') {
			setConnectionState(sender, { user: result.data.payload })
		}
	}

	async onRequest(req: Party.Request): Promise<Response> {
		const url = new URL(req.url)
		if (url.pathname.endsWith('/presence')) {
			return Response.json(this.getPresenceMessage().payload)
		}
		if (url.pathname.endsWith('/show')) {
			const users = this.getUsers()
			const workshopUsers = organizeUsersByWorkshop(users)
			const productHostCounts = getProductHostCounts(users)
			const latestVersion = await getLatestNpmVersion()
			const versionStats = getVersionStats(users, latestVersion)
			return new Response(
				`
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<meta http-equiv="refresh" content="5">
					<title>Epic Web Presence</title>
					<style>
						:root {
							--bg: #f8fafc;
							--bg-card: #ffffff;
							--text: #1e293b;
							--text-muted: #64748b;
							--border: #e2e8f0;
							--accent: #6366f1;
						}
						@media (prefers-color-scheme: dark) {
							:root {
								--bg: #0f172a;
								--bg-card: #1e293b;
								--text: #f1f5f9;
								--text-muted: #94a3b8;
								--border: #334155;
								--accent: #818cf8;
							}
						}
						* { box-sizing: border-box; }
						body {
							font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
							max-width: 900px;
							margin: 0 auto;
							padding: 24px;
							background: var(--bg);
							color: var(--text);
							line-height: 1.6;
						}
						h1 {
							font-size: 2rem;
							margin-bottom: 8px;
							display: flex;
							align-items: center;
							gap: 12px;
						}
						h2 {
							font-size: 1.25rem;
							margin: 24px 0 12px;
							padding-bottom: 8px;
							border-bottom: 1px solid var(--border);
							display: flex;
							align-items: center;
							gap: 8px;
						}
						.stats {
							display: flex;
							gap: 16px;
							flex-wrap: wrap;
							margin-bottom: 24px;
						}
						.stat {
							background: var(--bg-card);
							border: 1px solid var(--border);
							border-radius: 8px;
							padding: 12px 16px;
							min-width: 120px;
						}
						.stat-value {
							font-size: 1.5rem;
							font-weight: 600;
							color: var(--accent);
						}
						.stat-label {
							font-size: 0.875rem;
							color: var(--text-muted);
						}
						ul { padding: 0; margin: 0; }
						li {
							list-style: none;
							background: var(--bg-card);
							border: 1px solid var(--border);
							border-radius: 8px;
							padding: 12px 16px;
							margin-bottom: 8px;
							display: flex;
							align-items: center;
							gap: 12px;
						}
						.user-avatar-wrapper {
							position: relative;
							flex-shrink: 0;
						}
						.user-avatar {
							width: 48px;
							height: 48px;
							border-radius: 50%;
							object-fit: cover;
							border: 2px solid var(--border);
						}
						.product-badge {
							position: absolute;
							top: -4px;
							left: -4px;
							font-size: 14px;
							line-height: 1;
						}
						.user-info {
							flex: 1;
							min-width: 0;
						}
						.user-name {
							font-weight: 600;
							display: flex;
							align-items: center;
							gap: 6px;
						}
						.user-location {
							font-size: 0.875rem;
							color: var(--text-muted);
						}
						.badges {
							display: flex;
							gap: 6px;
							flex-wrap: wrap;
						}
						.badge {
							font-size: 0.75rem;
							padding: 2px 8px;
							border-radius: 9999px;
							background: var(--border);
							color: var(--text-muted);
						}
						.badge-access { background: #dcfce7; color: #166534; }
						.badge-preview { background: #fef3c7; color: #92400e; }
						.badge-optout { background: #fee2e2; color: #991b1b; }
						.badge-latest { background: #dcfce7; color: #166534; }
						.badge-outdated { background: #fee2e2; color: #991b1b; }
						.badge-updates { background: #fef3c7; color: #92400e; }
						.badge-ahead { background: #dbeafe; color: #1e40af; }
						@media (prefers-color-scheme: dark) {
							.badge-access { background: #166534; color: #dcfce7; }
							.badge-preview { background: #92400e; color: #fef3c7; }
							.badge-optout { background: #991b1b; color: #fee2e2; }
							.badge-latest { background: #166534; color: #dcfce7; }
							.badge-outdated { background: #991b1b; color: #fee2e2; }
							.badge-updates { background: #92400e; color: #fef3c7; }
							.badge-ahead { background: #1e40af; color: #dbeafe; }
						}
						.version-banner {
							background: linear-gradient(135deg, var(--accent), #a855f7);
							color: white;
							padding: 12px 20px;
							border-radius: 8px;
							margin-bottom: 20px;
							display: flex;
							align-items: center;
							gap: 8px;
							font-weight: 500;
						}
						.version-label { opacity: 0.9; }
						.version-value { 
							font-weight: 700; 
							font-family: monospace;
							background: rgba(255,255,255,0.2);
							padding: 2px 8px;
							border-radius: 4px;
						}
						.stat-success { color: #16a34a; }
						.stat-warning { color: #ea580c; }
						.stat-info { color: #2563eb; }
						@media (prefers-color-scheme: dark) {
							.stat-success { color: #4ade80; }
							.stat-warning { color: #fb923c; }
							.stat-info { color: #60a5fa; }
						}
						.user-version {
							font-size: 0.75rem;
							color: var(--text-muted);
							font-family: monospace;
							margin-top: 2px;
						}
						.repo-status {
							display: flex;
							gap: 6px;
							margin-top: 4px;
							flex-wrap: wrap;
						}
						.logged-in-products {
							font-size: 0.75rem;
							color: var(--text-muted);
							margin-top: 4px;
						}
						.legend {
							background: var(--bg-card);
							border: 1px solid var(--border);
							border-radius: 8px;
							padding: 16px;
							margin-bottom: 24px;
						}
						.legend h3 {
							margin: 0 0 8px;
							font-size: 0.875rem;
							color: var(--text-muted);
						}
						.legend-items {
							display: flex;
							gap: 16px;
							flex-wrap: wrap;
						}
						.legend-item {
							display: flex;
							align-items: center;
							gap: 6px;
							font-size: 0.875rem;
						}
					</style>
				</head>
				<body>
					<h1>🌐 Epic Web Presence</h1>
					${
						latestVersion
							? `
					<div class="version-banner">
						<span class="version-label">Latest epicshop version:</span>
						<span class="version-value">${latestVersion}</span>
					</div>
					`
							: ''
					}
					<div class="stats">
						<div class="stat">
							<div class="stat-value">${users.length}</div>
							<div class="stat-label">Total Users</div>
						</div>
						${
							latestVersion
								? `
						<div class="stat">
							<div class="stat-value stat-success">${versionStats.onLatest}</div>
							<div class="stat-label">On Latest</div>
						</div>
						<div class="stat">
							<div class="stat-value ${versionStats.outdated > 0 ? 'stat-warning' : ''}">${versionStats.outdated}</div>
							<div class="stat-label">Outdated</div>
						</div>
						`
								: ''
						}
						<div class="stat">
							<div class="stat-value ${versionStats.withRepoUpdates > 0 ? 'stat-warning' : ''}">${versionStats.withRepoUpdates}</div>
							<div class="stat-label">Need Repo Updates</div>
						</div>
						<div class="stat">
							<div class="stat-value ${versionStats.withCommitsAhead > 0 ? 'stat-info' : ''}">${versionStats.withCommitsAhead}</div>
							<div class="stat-label">Commits Ahead</div>
						</div>
						${Object.entries(productHostCounts)
							.map(
								([host, count]) => `
							<div class="stat">
								<div class="stat-value">${getProductHostEmoji(host) ?? '❓'} ${count}</div>
								<div class="stat-label">${host.replace('www.', '')}</div>
							</div>
						`,
							)
							.join('')}
					</div>
					<div class="legend">
						<h3>Product Legend</h3>
						<div class="legend-items">
							${Object.entries(productHostEmojis)
								.map(
									([host, emoji]) => `
								<div class="legend-item">
									<span>${emoji}</span>
									<span>${host.replace('www.', '')}</span>
								</div>
							`,
								)
								.join('')}
						</div>
					</div>
					${Object.entries(workshopUsers)
						.map(
							([workshop, workshopUsers]) => `
							<h2>${getWorkshopEmoji(workshopUsers)} ${workshop} <span style="font-weight: normal; color: var(--text-muted);">(${workshopUsers.length})</span></h2>
							<ul>
								${workshopUsers.map((entry) => generateUserListItem(entry, latestVersion)).join('')}
							</ul>
						`,
						)
						.join('')}
				</body>
				</html>
				`,
				{
					headers: {
						'Content-Type': 'text/html',
					},
				},
			)
		}
		return new Response('not found', { status: 404 })
	}
} satisfies Party.Worker)

function shallowMergeConnectionState(
	connection: Party.Connection,
	state: ConnectionState,
) {
	setConnectionState(connection, (prev) => ({ ...prev, ...state }))
}

function setConnectionState(
	connection: Party.Connection,
	state:
		| ConnectionState
		| ((prev: ConnectionState | null) => ConnectionState | null),
) {
	if (typeof state !== 'function') {
		return connection.setState(state)
	}
	connection.setState((prev: unknown) => {
		const prevParseResult = ConnectionStateSchema.safeParse(prev)
		if (prevParseResult.success) {
			return state(prevParseResult.data)
		} else {
			return state(null)
		}
	})
}

function getConnectionState(connection: Party.Connection) {
	const result = ConnectionStateSchema.safeParse(connection.state)
	if (result.success) {
		return result.data
	} else {
		setConnectionState(connection, null)
		return null
	}
}

function sortUsers(users: Array<User>) {
	return [...users].sort((a, b) => {
		const aScore = getScore(a)
		const bScore = getScore(b)
		if (aScore === bScore) return 0
		return aScore > bScore ? -1 : 1
	})
}

function getScore(user: User) {
	let score = 0
	if (user.imageUrlSmall) score += 1
	if (user.imageUrlSmall?.includes('discordapp')) score += 0.5
	if (user.name) score += 1
	return score
}

function getUserLocations(user: User): Array<NonNullable<User['location']>> {
	if (user.locations && user.locations.length > 0) {
		return user.locations.filter(Boolean) as Array<
			NonNullable<User['location']>
		>
	}
	if (user.location) {
		return [user.location]
	}
	return []
}

function organizeUsersByWorkshop(users: Array<User>) {
	const workshopUsers: Record<
		string,
		Array<{ user: User; location: NonNullable<User['location']> | null }>
	> = {}

	for (const user of users) {
		if (user.optOut) {
			if (!workshopUsers['Opted Out']) {
				workshopUsers['Opted Out'] = []
			}
			workshopUsers['Opted Out']?.push({ user, location: null })
			continue
		}

		const locations = getUserLocations(user)
		if (locations.length === 0) {
			if (!workshopUsers['Unknown Workshop']) {
				workshopUsers['Unknown Workshop'] = []
			}
			workshopUsers['Unknown Workshop']?.push({ user, location: null })
		} else {
			// Add user to each workshop they're connected to
			for (const location of locations) {
				const workshop = location.workshopTitle ?? 'Unknown Workshop'
				if (!workshopUsers[workshop]) {
					workshopUsers[workshop] = []
				}
				workshopUsers[workshop]?.push({ user, location })
			}
		}
	}

	// Sort users within each workshop by exercise and step number
	for (const workshop in workshopUsers) {
		workshopUsers[workshop]?.sort((a, b) => {
			// Opted-out users have no exercise info
			if (a.user.optOut || b.user.optOut) return 0

			const aExercise = a.location?.exercise?.exerciseNumber ?? 0
			const bExercise = b.location?.exercise?.exerciseNumber ?? 0
			if (aExercise !== bExercise) return aExercise - bExercise

			const aStep = a.location?.exercise?.stepNumber ?? 0
			const bStep = b.location?.exercise?.stepNumber ?? 0
			return aStep - bStep
		})
	}

	return workshopUsers
}

function getProductHostCounts(users: Array<User>) {
	const counts: Record<string, number> = {}
	for (const user of users) {
		const locations = getUserLocations(user)
		for (const loc of locations) {
			const host = loc.productHost
			if (host) {
				counts[host] = (counts[host] ?? 0) + 1
			}
		}
	}
	return counts
}

function getWorkshopEmoji(
	entries: Array<{
		user: User
		location: NonNullable<User['location']> | null
	}>,
): string {
	// Get the product host emoji for this workshop group
	const firstEntry = entries[0]
	if (!firstEntry) return ''
	if (firstEntry.user.optOut) return '🙈'

	return getProductHostEmoji(firstEntry.location?.productHost) ?? ''
}

function getLoggedInProductEmojis(hosts: string[] | null | undefined): string {
	if (!hosts || hosts.length === 0) return ''
	return hosts
		.map((host) => productHostEmojis[host])
		.filter(Boolean)
		.join(' ')
}

function formatLocationString(
	loc: NonNullable<User['location']> | null,
): string {
	if (!loc) return 'Unknown location'
	if (loc.exercise) {
		return [
			`Exercise ${loc.exercise.exerciseNumber}`,
			loc.exercise.stepNumber && `Step ${loc.exercise.stepNumber}`,
			loc.exercise.type && `(${loc.exercise.type})`,
		]
			.filter(Boolean)
			.join(', ')
	}
	return loc.origin ?? 'Unknown location'
}

function getVersionStats(users: Array<User>, latestVersion: string | null) {
	let onLatest = 0
	let outdated = 0
	let withRepoUpdates = 0
	let withCommitsAhead = 0
	let unknown = 0

	for (const user of users) {
		const version = user.epicshopVersion
		if (version && latestVersion) {
			if (version === latestVersion) {
				onLatest++
			} else {
				outdated++
			}
		} else if (!version) {
			unknown++
		}

		const repoStatus = user.repoStatus
		if (repoStatus?.updatesAvailable) {
			withRepoUpdates++
		}
		if (repoStatus?.commitsAhead && repoStatus.commitsAhead > 0) {
			withCommitsAhead++
		}
	}

	return { onLatest, outdated, withRepoUpdates, withCommitsAhead, unknown }
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function formatVersionBadge(
	version: string | null | undefined,
	latestVersion: string | null,
): string {
	if (!version) return ''

	const safeVersion = escapeHtml(version)

	// If we don't know the latest version, show a neutral badge (no status indicator)
	if (!latestVersion) {
		return `<span class="badge">v${safeVersion}</span>`
	}

	const isLatest = version === latestVersion
	const badgeClass = isLatest ? 'badge-latest' : 'badge-outdated'
	const icon = isLatest ? '✓' : '↑'

	return `<span class="badge ${badgeClass}">${icon} v${safeVersion}</span>`
}

function formatRepoStatusBadges(
	repoStatus: RepoStatus | null | undefined,
): string {
	if (!repoStatus) return ''

	const badges: string[] = []

	if (repoStatus.updatesAvailable) {
		badges.push('<span class="badge badge-updates">⬇ Updates Available</span>')
	}

	if (repoStatus.commitsAhead && repoStatus.commitsAhead > 0) {
		badges.push(
			`<span class="badge badge-ahead">⬆ ${repoStatus.commitsAhead} commit${repoStatus.commitsAhead > 1 ? 's' : ''} ahead</span>`,
		)
	}

	return badges.join('')
}

function generateUserListItem(
	entry: {
		user: User
		location: NonNullable<User['location']> | null
	},
	latestVersion: string | null,
) {
	const { user, location } = entry
	const imageUrl = user.imageUrlLarge ?? user.avatarUrl
	const name = user.optOut ? 'Anonymous' : (user.name ?? 'Anonymous')
	const loggedInEmojis = getLoggedInProductEmojis(user.loggedInProductHosts)
	const productEmoji = getProductHostEmoji(location?.productHost)
	const versionBadge = formatVersionBadge(user.epicshopVersion, latestVersion)
	const repoStatusBadges = formatRepoStatusBadges(user.repoStatus)

	// Handle opted-out users
	if (user.optOut) {
		return `
		<li>
			<div class="user-avatar-wrapper">
				<div class="user-avatar" style="background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px;">👤</div>
			</div>
			<div class="user-info">
				<div class="user-name">Anonymous</div>
				<div class="badges">
					<span class="badge badge-optout">Opted out</span>
					${versionBadge}
				</div>
				${repoStatusBadges ? `<div class="repo-status">${repoStatusBadges}</div>` : ''}
				${loggedInEmojis ? `<div class="logged-in-products">Logged into: ${loggedInEmojis}</div>` : ''}
			</div>
		</li>
	`
	}

	const accessBadge =
		typeof user.hasAccess === 'boolean'
			? user.hasAccess
				? '<span class="badge badge-access">Has Access</span>'
				: '<span class="badge badge-preview">Preview</span>'
			: ''

	const avatarHtml = imageUrl
		? `<img class="user-avatar" src="${imageUrl}" alt="${name}" />`
		: `<div class="user-avatar" style="background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px;">👤</div>`

	return `
		<li>
			<div class="user-avatar-wrapper">
				${avatarHtml}
				${productEmoji ? `<span class="product-badge">${productEmoji}</span>` : ''}
			</div>
			<div class="user-info">
				<div class="user-name">${name}</div>
				<div class="user-location">${formatLocationString(location)}</div>
				<div class="badges">
					${accessBadge}
					${versionBadge}
				</div>
				${repoStatusBadges ? `<div class="repo-status">${repoStatusBadges}</div>` : ''}
				${loggedInEmojis ? `<div class="logged-in-products">Logged into: ${loggedInEmojis}</div>` : ''}
			</div>
		</li>
	`
}
