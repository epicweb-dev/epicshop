import path from 'path'
import { EventEmitter } from 'stream'

declare global {
	var __require_cache_purge_emitter__: EventEmitter
}

export const requireCachePurgeEmitter =
	(global.__require_cache_purge_emitter__ =
		global.__require_cache_purge_emitter__ ?? new EventEmitter())

const BUILD_DIR_FILE = path.join(process.cwd(), 'build/remix.js')

export function purgeRequireCache() {
	requireCachePurgeEmitter.emit('before:purge')
	// purge require cache on requests for "server side HMR" this won't let
	// you have in-memory objects between requests in development,
	// alternatively you can set up nodemon/pm2-dev to restart the server on
	// file changes, but then you'll have to reconnect to databases/etc on each
	// change. We prefer the DX of this, so we've included it for you by default
	for (const key in require.cache) {
		if (key.startsWith(BUILD_DIR_FILE)) {
			delete require.cache[key]
		}
	}
}
