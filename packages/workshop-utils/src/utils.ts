import './init-env.ts'

import { remember } from '@epic-web/remember'
import dayjsLib from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime.js'
import timeZonePlugin from 'dayjs/plugin/timezone.js'
import utcPlugin from 'dayjs/plugin/utc.js'

export const dayjs = remember('dayjs', () => {
	dayjsLib.extend(utcPlugin)
	dayjsLib.extend(timeZonePlugin)
	dayjsLib.extend(relativeTimePlugin)
	return dayjsLib
})

export function getErrorMessage(
	error: unknown,
	fallbackMessage = 'Unknown Error',
): string {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	console.error('Unable to get error message for error', error)
	return fallbackMessage
}

export function handleGitHubRepoAndRoot({
	githubRepo,
	githubRoot,
}: {
	githubRepo?: string
	githubRoot?: string
}) {
	if (githubRepo) {
		githubRepo = githubRepo.replace(/\/$/, '')
		githubRoot = `${githubRepo}/tree/main`
	} else if (githubRoot) {
		githubRepo = githubRoot.replace(/\/(blob|tree)\/.*$/, '')
		githubRoot = `${githubRepo}/tree/main`
	} else {
		throw new Error(
			`Either githubRepo or githubRoot is required. Please ensure your epicshop package.json config includes either githubRepo or githubRoot configuration.`,
		)
	}
	return { githubRepo, githubRoot }
}
