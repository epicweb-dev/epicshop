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

// Threshold for considering a user inactive (30 minutes)
const INACTIVE_THRESHOLD_MS = 1000 * 60 * 30

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
type PresenceSubscription = 'lite' | 'full'

const PresenceSubscriptionSchema = z.union([
	z.literal('lite'),
	z.literal('full'),
])
const ConnectionStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
		subscription: PresenceSubscriptionSchema.optional(),
		// ISO timestamp of when this connection last sent an update
		lastUpdatedAt: z.string().nullable().optional(),
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

	onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
		const url = new URL(ctx.request.url)
		const wantsFull =
			url.searchParams.get('full') === '1' ||
			url.searchParams.get('full') === 'true'
		shallowMergeConnectionState(connection, {
			subscription: wantsFull ? 'full' : 'lite',
		})
	}

	updateUsers() {
		const fullUsers = this.getUsers()
		const liteUsers = getLiteUsers(fullUsers)

		const fullPresenceMessage = JSON.stringify(
			this.getPresenceMessage(fullUsers),
		)
		const litePresenceMessage = JSON.stringify(
			this.getPresenceMessage(liteUsers),
		)

		for (const connection of this.party.getConnections()) {
			const state = getConnectionState(connection)
			const subscription: PresenceSubscription = state?.subscription ?? 'lite'
			connection.send(
				subscription === 'full' ? fullPresenceMessage : litePresenceMessage,
			)
		}
	}

	getPresenceMessage(users: Array<User>) {
		return {
			type: 'presence',
			payload: { users },
		} satisfies Message
	}

	getUsers() {
		const users = new Map<string, z.infer<typeof UserSchema>>()

		for (const connection of this.party.getConnections()) {
			const state = getConnectionState(connection)
			if (state?.user) {
				const existingUser = users.get(state.user.id)
				// Attach lastUpdatedAt from connection state to the location
				const locationWithTimestamp = state.user.location
					? { ...state.user.location, lastUpdatedAt: state.lastUpdatedAt }
					: null
				if (existingUser) {
					// Aggregate locations from multiple connections
					const existingLocations =
						existingUser.locations ??
						(existingUser.location ? [existingUser.location] : [])
					const newLocation = locationWithTimestamp
					if (newLocation) {
						// Check if this location is already in the list (by workshopTitle)
						const existingIndex = existingLocations.findIndex(
							(loc) =>
								loc.workshopTitle === newLocation.workshopTitle &&
								loc.exercise?.exerciseNumber ===
									newLocation.exercise?.exerciseNumber &&
								loc.exercise?.stepNumber === newLocation.exercise?.stepNumber,
						)
						if (existingIndex === -1) {
							existingUser.locations = [...existingLocations, newLocation]
						} else {
							// Update lastUpdatedAt if this connection is more recent
							const existingLoc = existingLocations[existingIndex]
							if (
								existingLoc &&
								newLocation.lastUpdatedAt &&
								(!existingLoc.lastUpdatedAt ||
									newLocation.lastUpdatedAt > existingLoc.lastUpdatedAt)
							) {
								existingLocations[existingIndex] = {
									...existingLoc,
									lastUpdatedAt: newLocation.lastUpdatedAt,
								}
								existingUser.locations = existingLocations
							}
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
					if (locationWithTimestamp) {
						user.location = locationWithTimestamp
						user.locations = [locationWithTimestamp]
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
			shallowMergeConnectionState(sender, {
				user: result.data.payload,
				lastUpdatedAt: new Date().toISOString(),
			})
			this.updateUsers()
		} else if (result.data.type === 'remove-user') {
			setConnectionState(sender, null)
			this.updateUsers()
		} else if (result.data.type === 'add-anonymous-user') {
			setConnectionState(sender, {
				user: result.data.payload,
				lastUpdatedAt: new Date().toISOString(),
			})
		}
	}

	async onRequest(req: Party.Request): Promise<Response> {
		const url = new URL(req.url)
		if (url.pathname.endsWith('/presence')) {
			const wantsFull =
				url.searchParams.get('full') === '1' ||
				url.searchParams.get('full') === 'true'
			const fullUsers = this.getUsers()
			const users = wantsFull ? fullUsers : getLiteUsers(fullUsers)
			return Response.json({ users })
		}
		if (url.pathname.endsWith('/show')) {
			const generatedAtIso = new Date().toISOString()
			const users = this.getUsers()
			const workshopUsers = organizeUsersByWorkshop(users)
			const productHostCounts = getProductHostCounts(users)
			const latestVersion = await getLatestNpmVersion()
			const versionStats = getVersionStats(users, latestVersion)
			const activityStats = getActivityStats(users)
			const presenceRootHtml = renderPresenceRootHtml({
				generatedAtIso,
				users,
				workshopUsers,
				productHostCounts,
				latestVersion,
				versionStats,
				activityStats,
			})

			const fragment = url.searchParams.get('fragment')
			if (fragment === 'presence-root' || fragment === '1') {
				return new Response(presenceRootHtml, {
					headers: {
						'Content-Type': 'text/html',
					},
				})
			}
			return new Response(
				/* html */
				`
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
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
						.badge-inactive { background: #f3f4f6; color: #6b7280; }
						.user-last-active {
							font-size: 0.75rem;
							color: var(--text-muted);
							margin-top: 2px;
						}
						.user-last-active.inactive {
							color: #9ca3af;
						}
						.user-entry.inactive {
							opacity: 0.6;
						}
						@media (prefers-color-scheme: dark) {
							.badge-access { background: #166534; color: #dcfce7; }
							.badge-preview { background: #92400e; color: #fef3c7; }
							.badge-optout { background: #991b1b; color: #fee2e2; }
							.badge-latest { background: #166534; color: #dcfce7; }
							.badge-outdated { background: #991b1b; color: #fee2e2; }
							.badge-updates { background: #92400e; color: #fef3c7; }
							.badge-ahead { background: #1e40af; color: #dbeafe; }
							.badge-inactive { background: #374151; color: #9ca3af; }
							.user-last-active.inactive {
								color: #6b7280;
							}
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
						.stat-muted { color: #9ca3af; }
						@media (prefers-color-scheme: dark) {
							.stat-success { color: #4ade80; }
							.stat-warning { color: #fb923c; }
							.stat-info { color: #60a5fa; }
							.stat-muted { color: #6b7280; }
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
						.generated-meta {
							display: flex;
							flex-wrap: wrap;
							gap: 8px;
							align-items: center;
							margin: 6px 0 18px;
							color: var(--text-muted);
							font-size: 0.875rem;
						}
						.generated-meta-value {
							font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
						}
						.generated-meta-sep {
							opacity: 0.6;
						}
					</style>
				</head>
				<body>
					<div id="presence-root">
						${presenceRootHtml}
					</div>
					<script>
						(() => {
							const POLL_INTERVAL_MS = 5000
							const RELOAD_DEBOUNCE_MS = 150

							let pollIntervalId = null
							let refreshTimeoutId = null
							let refreshInFlight = false
							let refreshQueued = false

							function formatElapsedSeconds(totalSeconds) {
								const s = Math.max(0, Math.floor(totalSeconds))
								if (s < 60) return s + 's'
								const m = Math.floor(s / 60)
								const remS = s % 60
								if (m < 60) return m + 'm ' + remS + 's'
								const h = Math.floor(m / 60)
								const remM = m % 60
								return h + 'h ' + remM + 'm'
							}

							function updateGeneratedAtUi() {
								const generatedAtEl = document.getElementById('presence-generated-at')
								const sinceEl = document.getElementById('presence-time-since')
								if (!generatedAtEl || !sinceEl) return
								const iso = generatedAtEl.getAttribute('datetime')
								if (!iso) return
								const timestamp = Date.parse(iso)
								if (!Number.isFinite(timestamp)) return
								const diffSeconds = (Date.now() - timestamp) / 1000
								sinceEl.textContent = formatElapsedSeconds(diffSeconds) + ' ago'
							}

							function updateLastActiveUi() {
								const els = document.querySelectorAll(
									'time.user-last-active-time[datetime]',
								)
								for (const el of els) {
									const iso = el.getAttribute('datetime')
									if (!iso) continue
									const timestamp = Date.parse(iso)
									if (!Number.isFinite(timestamp)) continue
									const diffSeconds = (Date.now() - timestamp) / 1000
									el.textContent = formatElapsedSeconds(diffSeconds) + ' ago'
								}
							}

							function updateRelativeTimeUi() {
								updateGeneratedAtUi()
								updateLastActiveUi()
							}

							function scheduleRefresh() {
								if (refreshTimeoutId) return
								refreshTimeoutId = setTimeout(() => {
									refreshTimeoutId = null
									void refreshFromServer()
								}, RELOAD_DEBOUNCE_MS)
							}

							function startPollingFallback() {
								if (pollIntervalId) return
								pollIntervalId = setInterval(() => {
									void refreshFromServer()
								}, POLL_INTERVAL_MS)
							}

							async function refreshFromServer() {
								if (refreshInFlight) {
									refreshQueued = true
									return
								}
								refreshInFlight = true
								try {
									const currentRoot = document.getElementById('presence-root')
									if (!currentRoot) return

									const url = new URL(location.href)
									url.searchParams.set('fragment', 'presence-root')
									url.searchParams.set('_', Date.now().toString())

									const res = await fetch(url.toString(), { cache: 'no-store' })
									if (!res.ok) throw new Error('Failed to refresh')
									const html = await res.text()

									const scrollY = window.scrollY
									currentRoot.innerHTML = html
									window.scrollTo({ top: scrollY })
									updateRelativeTimeUi()
								} catch {
									// If anything goes wrong, fall back to polling (best effort).
									startPollingFallback()
								} finally {
									refreshInFlight = false
									if (refreshQueued) {
										refreshQueued = false
										void refreshFromServer()
									}
								}
							}

							function getRoomWebSocketUrl() {
								const url = new URL(location.href)
								url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
								// '/show' is an HTTP endpoint; the room websocket is at the room root.
								if (url.pathname.endsWith('/show')) {
									url.pathname = url.pathname.replace(/\\/show$/, '')
								}
								url.search = ''
								url.hash = ''
								return url.toString()
							}

							try {
								const ws = new WebSocket(getRoomWebSocketUrl())
								ws.addEventListener('message', (event) => {
									try {
										const data = JSON.parse(event.data)
										if (data && data.type === 'presence') {
											scheduleRefresh()
										}
									} catch {
										// If the server ever changes the message format, fall back to reloading.
										scheduleRefresh()
									}
								})
								ws.addEventListener('close', () => startPollingFallback())
								ws.addEventListener('error', () => startPollingFallback())
							} catch {
								startPollingFallback()
							}

							updateRelativeTimeUi()
							setInterval(updateRelativeTimeUi, 1000)
						})()
					</script>
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

function getLiteUsers(users: Array<User>): Array<User> {
	return users.map((user) => {
		const locations = getUserLocations(user).map((loc) => ({
			workshopTitle: loc.workshopTitle,
			productHost: loc.productHost,
			exercise: loc.exercise,
		}))

		const location = locations[0] ?? null

		return {
			id: user.id,
			hasAccess: user.hasAccess,
			avatarUrl: user.avatarUrl,
			imageUrlSmall: user.imageUrlSmall,
			imageUrlLarge: user.imageUrlLarge,
			name: user.name,
			optOut: user.optOut,
			loggedInProductHosts: user.loggedInProductHosts,
			location,
			locations,
		}
	})
}

function renderPresenceRootHtml({
	generatedAtIso,
	users,
	workshopUsers,
	productHostCounts,
	latestVersion,
	versionStats,
	activityStats,
}: {
	generatedAtIso: string
	users: Array<User>
	workshopUsers: ReturnType<typeof organizeUsersByWorkshop>
	productHostCounts: ReturnType<typeof getProductHostCounts>
	latestVersion: string | null
	versionStats: ReturnType<typeof getVersionStats>
	activityStats: ReturnType<typeof getActivityStats>
}) {
	const safeGeneratedAtIso = escapeHtml(generatedAtIso)
	return `
		<h1>🌐 Epic Web Presence</h1>
		<div class="generated-meta">
			<span class="generated-meta-label">Generated:</span>
			<time id="presence-generated-at" class="generated-meta-value" datetime="${safeGeneratedAtIso}">${safeGeneratedAtIso}</time>
			<span class="generated-meta-sep">·</span>
			<span class="generated-meta-label">Last update:</span>
			<span id="presence-time-since" class="generated-meta-value">0s ago</span>
		</div>
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
			<div class="stat">
				<div class="stat-value stat-success">${activityStats.active}</div>
				<div class="stat-label">Active</div>
			</div>
			<div class="stat">
				<div class="stat-value ${activityStats.inactive > 0 ? 'stat-muted' : ''}">${activityStats.inactive}</div>
				<div class="stat-label">Inactive (30m+)</div>
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
	`
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
		// Check version and repo status across all of the user's locations
		// (users can be connected to multiple workshops simultaneously)
		const locations = getUserLocations(user)

		// Use version from any location if available
		const hasVersion = locations.some((loc) => loc.epicshopVersion)
		if (hasVersion && latestVersion) {
			const version = locations.find(
				(loc) => loc.epicshopVersion,
			)?.epicshopVersion
			if (version === latestVersion) {
				onLatest++
			} else {
				outdated++
			}
		} else if (!hasVersion) {
			unknown++
		}

		// Count user if any location has updates available
		if (locations.some((loc) => loc.repoStatus?.updatesAvailable)) {
			withRepoUpdates++
		}
		// Count user if any location has commits ahead
		if (
			locations.some(
				(loc) =>
					loc.repoStatus?.commitsAhead && loc.repoStatus.commitsAhead > 0,
			)
		) {
			withCommitsAhead++
		}
	}

	return { onLatest, outdated, withRepoUpdates, withCommitsAhead, unknown }
}

function isLocationActive(
	location: NonNullable<User['location']> | null,
	now: number,
): boolean {
	if (!location?.lastUpdatedAt) return true // Assume active if no timestamp (backwards compat)
	const lastUpdated = Date.parse(location.lastUpdatedAt)
	if (!Number.isFinite(lastUpdated)) return true
	return now - lastUpdated < INACTIVE_THRESHOLD_MS
}

function getActivityStats(users: Array<User>) {
	const now = Date.now()
	let active = 0
	let inactive = 0

	for (const user of users) {
		const locations = getUserLocations(user)
		// A user is considered active if any of their locations had a recent update
		const isActive =
			locations.length === 0 ||
			locations.some((loc) => isLocationActive(loc, now))
		if (isActive) {
			active++
		} else {
			inactive++
		}
	}

	return { active, inactive }
}

function formatTimeSince(isoTimestamp: string | null | undefined): string {
	if (!isoTimestamp) return ''
	const timestamp = Date.parse(isoTimestamp)
	if (!Number.isFinite(timestamp)) return ''
	const diffMs = Date.now() - timestamp
	const diffSeconds = Math.floor(diffMs / 1000)
	if (diffSeconds < 60) return `${diffSeconds}s ago`
	const diffMinutes = Math.floor(diffSeconds / 60)
	if (diffMinutes < 60) return `${diffMinutes}m ${diffSeconds % 60}s ago`
	const diffHours = Math.floor(diffMinutes / 60)
	const remainingMinutes = diffMinutes % 60
	return `${diffHours}h ${remainingMinutes}m ago`
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
	// Get version/repo status from location
	const version = location?.epicshopVersion
	const repoStatus = location?.repoStatus
	const versionBadge = formatVersionBadge(version, latestVersion)
	const repoStatusBadges = formatRepoStatusBadges(repoStatus)

	// Activity status
	const now = Date.now()
	const isActive = isLocationActive(location, now)
	const lastActiveText = location?.lastUpdatedAt
		? formatTimeSince(location.lastUpdatedAt)
		: ''
	const safeLastUpdatedAtIso = location?.lastUpdatedAt
		? escapeHtml(location.lastUpdatedAt)
		: ''
	const inactiveClass = isActive ? '' : ' inactive'
	const inactiveBadge = isActive
		? ''
		: '<span class="badge badge-inactive">Inactive</span>'

	// Handle opted-out users
	if (user.optOut) {
		return `
		<li class="user-entry${inactiveClass}">
			<div class="user-avatar-wrapper">
				<div class="user-avatar" style="background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px;">👤</div>
			</div>
			<div class="user-info">
				<div class="user-name">Anonymous</div>
				<div class="badges">
					<span class="badge badge-optout">Opted out</span>
					${inactiveBadge}
					${versionBadge}
				</div>
				${
					lastActiveText
						? `<div class="user-last-active${inactiveClass}">Last active: <time class="user-last-active-time" datetime="${safeLastUpdatedAtIso}">${lastActiveText}</time></div>`
						: ''
				}
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
		<li class="user-entry${inactiveClass}">
			<div class="user-avatar-wrapper">
				${avatarHtml}
				${productEmoji ? `<span class="product-badge">${productEmoji}</span>` : ''}
			</div>
			<div class="user-info">
				<div class="user-name">${name}</div>
				<div class="user-location">${formatLocationString(location)}</div>
				<div class="badges">
					${accessBadge}
					${inactiveBadge}
					${versionBadge}
				</div>
				${
					lastActiveText
						? `<div class="user-last-active${inactiveClass}">Last active: <time class="user-last-active-time" datetime="${safeLastUpdatedAtIso}">${lastActiveText}</time></div>`
						: ''
				}
				${repoStatusBadges ? `<div class="repo-status">${repoStatusBadges}</div>` : ''}
				${loggedInEmojis ? `<div class="logged-in-products">Logged into: ${loggedInEmojis}</div>` : ''}
			</div>
		</li>
	`
}
