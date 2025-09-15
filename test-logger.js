#!/usr/bin/env node

// Test script to demonstrate the logger functionality
import { debuglog } from 'node:util'

function logger(ns) {
	const log = debuglog(ns)
	return (...args) => log(...args)
}

function isLoggingEnabled(ns) {
	return debuglog(ns).enabled
}

console.log('Testing logger utility...\n')

// Test different logger namespaces
const videoInfoLog = logger('epic-api:video-info')
const progressLog = logger('epic-api:progress')
const userInfoLog = logger('epic-api:user-info')
const generalLog = logger('epic-api:general')

console.log('Logger enabled status:')
console.log('- epic-api:video-info:', isLoggingEnabled('epic-api:video-info'))
console.log('- epic-api:progress:', isLoggingEnabled('epic-api:progress'))
console.log('- epic-api:user-info:', isLoggingEnabled('epic-api:user-info'))
console.log('- epic-api:general:', isLoggingEnabled('epic-api:general'))
console.log('')

// Test logging calls
videoInfoLog('fetching video info for URL: %s', 'https://www.epicweb.dev/workshops/react-hooks')
videoInfoLog('making API request to: %s', 'https://www.epicweb.dev/api/workshops/react-hooks')
videoInfoLog('API response: %d %s', 200, 'OK')

progressLog('fetching progress from EpicWeb host: %s', 'www.epicweb.dev')
progressLog('making progress API request to: %s', 'https://www.epicweb.dev/api/progress')
progressLog('progress API response: %d %s', 200, 'OK')
progressLog('successfully fetched %d progress entries', 5)

userInfoLog('fetching user info from: %s', 'https://www.epicweb.dev/oauth/userinfo')
userInfoLog('user info API response: %d %s', 200, 'OK')
userInfoLog('successfully fetched user info for user: %s (%s)', 'user123', 'user@example.com')

generalLog('deployed mode, skipping epic video info fetch')
generalLog('no auth info available, returning empty progress array')

console.log('\nTest completed!')
console.log('To see the logs, run with: NODE_DEBUG=epic-api:* node test-logger.js')