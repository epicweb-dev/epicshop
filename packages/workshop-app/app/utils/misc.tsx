import { type ExerciseStepApp } from '@epic-web/workshop-utils/apps.server'
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

export function ensureUndeployed() {
	if (ENV.EPICSHOP_DEPLOYED) {
		throw new Response(
			'EPICSHOP_DEPLOYED is true, cannot perform this action. Run this locally instead.',
			{
				status: 400,
			},
		)
	}
}

export function ensureDeployed() {
	if (!ENV.EPICSHOP_DEPLOYED) {
		throw new Response(
			'EPICSHOP_DEPLOYED is false, cannot perform this action. Run deployed version instead.',
			{ status: 400 },
		)
	}
}

export function getUserImgSrc(imageId?: string | null) {
	return imageId ? `/resources/user-images/${imageId}` : '/img/user.png'
}

export function getNoteImgSrc(imageId: string) {
	return `/resources/note-images/${imageId}`
}

export function getErrorMessage(
	error: unknown,
	defaultMessage: string = 'Unknown Error',
) {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	return defaultMessage
}

const customTwMerge = extendTailwindMerge({})

export function cn(...inputs: ClassValue[]) {
	return customTwMerge(clsx(inputs))
}

export function getDomainUrl(request: Request) {
	const url = new URL(request.url)
	const host =
		request.headers.get('X-Forwarded-Host') ??
		request.headers.get('host') ??
		url.host

	const protocol = host.includes('localhost') ? 'http:' : url.protocol
	return `${protocol}//${host}`
}

export function getBaseUrl({
	request,
	domain = request ? getDomainUrl(request) : window.location.origin,
	port,
}: {
	port: number
} & (
	| {
			request: Request
			domain?: never
	  }
	| {
			request?: never
			domain: string
	  }
)) {
	const url = new URL(domain)
	url.port = String(port)
	return url.toString()
}

export function getReferrerRoute(request: Request) {
	// spelling errors and whatever makes this annoyingly inconsistent
	// in my own testing, `referer` returned the right value, but 🤷‍♂️
	const referrer =
		request.headers.get('referer') ??
		request.headers.get('referrer') ??
		request.referrer
	const domain = getDomainUrl(request)
	if (referrer.startsWith(domain)) {
		return referrer.slice(domain.length)
	} else {
		return '/'
	}
}

/**
 * Merge multiple headers objects into one (uses set so headers are overridden)
 */
export function mergeHeaders(
	...headers: Array<ResponseInit['headers'] | null | undefined>
) {
	const merged = new Headers()
	for (const header of headers) {
		if (!header) continue
		for (const [key, value] of new Headers(header).entries()) {
			merged.set(key, value)
		}
	}
	return merged
}

/**
 * Combine multiple header objects into one (uses append so headers are not overridden)
 */
export function combineHeaders(
	...headers: Array<ResponseInit['headers'] | null | undefined>
) {
	const combined = new Headers()
	for (const header of headers) {
		if (!header) continue
		for (const [key, value] of new Headers(header).entries()) {
			combined.append(key, value)
		}
	}
	return combined
}

/**
 * Combine multiple response init objects into one (uses combineHeaders)
 */
export function combineResponseInits(
	...responseInits: Array<ResponseInit | null | undefined>
) {
	let combined: ResponseInit = {}
	for (const responseInit of responseInits) {
		combined = {
			...responseInit,
			headers: combineHeaders(combined.headers, responseInit?.headers),
		}
	}
	return combined
}

export async function downloadFile(url: string, retries: number = 0) {
	const MAX_RETRIES = 3
	try {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`Failed to fetch image with status ${response.status}`)
		}
		const contentType = response.headers.get('content-type') ?? 'image/jpg'
		const blob = Buffer.from(await response.arrayBuffer())
		return { contentType, blob }
	} catch (e) {
		if (retries > MAX_RETRIES) throw e
		return downloadFile(url, retries + 1)
	}
}

export function getExercisePath(exerciseNumber: number, suffix?: 'finished') {
	const exerciseNumberStr = exerciseNumber.toString().padStart(2, '0')
	if (!suffix) return `/exercise/${exerciseNumberStr}`

	return `/exercise/${exerciseNumberStr}/${suffix}`
}

export function getExerciseStepPath(
	exerciseNumber: number,
	stepNumber: number,
	type?: ExerciseStepApp['type'],
) {
	const exerciseNumberStr = exerciseNumber.toString().padStart(2, '0')
	if (!stepNumber) return `/exercise/${exerciseNumberStr}`

	const stepNumberStr = stepNumber.toString().padStart(2, '0')
	if (!type) return `/exercise/${exerciseNumberStr}/${stepNumberStr}`

	return `/exercise/${exerciseNumberStr}/${stepNumberStr}/${type}`
}

export function calculateExpirationTime(metadata: {
	createdTime: number
	ttl?: number | null
}): number | null {
	const { createdTime, ttl } = metadata
	if (ttl === undefined || ttl === null || ttl === Infinity) {
		return null // Never expires
	}
	return createdTime + ttl
}

export function formatTimeRemaining(expirationTime: number): {
	text: string
	isExpired: boolean
	isExpiringSoon: boolean
} {
	const now = Date.now()
	const remaining = expirationTime - now

	if (remaining <= 0) {
		return { text: 'Expired', isExpired: true, isExpiringSoon: false }
	}

	const seconds = Math.floor(remaining / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	let text: string
	let isExpiringSoon: boolean

	if (days > 0) {
		text = `${days}d ${hours % 24}h`
		isExpiringSoon = days < 1.5
	} else if (hours > 0) {
		text = `${hours}h ${minutes % 60}m`
		isExpiringSoon = hours < 2
	} else if (minutes > 0) {
		text = `${minutes}m ${seconds % 60}s`
		isExpiringSoon = minutes < 10
	} else {
		text = `${seconds}s`
		isExpiringSoon = true
	}

	return { text, isExpired: false, isExpiringSoon }
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60000) return `${Math.round(ms / 1000)}s`
	if (ms < 3600000) return `${Math.round(ms / 60000)}m`
	if (ms < 86400000) return `${Math.round(ms / 3600000)}h`
	if (ms < 604800000) return `${Math.round(ms / 86400000)}d`
	if (ms < 2629746000) return `${Math.round(ms / 604800000)}w`
	if (ms < 31556952000) return `${Math.round(ms / 2629746000)}mo`
	return `${Math.round(ms / 31556952000)}y`
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
