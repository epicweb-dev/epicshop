import { type NextFunction, type Request, type Response } from 'express'

/**
 * GitHub Codespaces (and similar port-forward proxies) often rewrite the
 * browser `Origin` to `localhost:<port>` while setting `X-Forwarded-Host` to
 * the public `*.app.github.dev` host. React Router's single-fetch CSRF check
 * prefers `X-Forwarded-Host`, so legitimate same-tab POSTs fail with 400 and
 * the client surfaces React Router's opaque "Unexpected Server Error".
 *
 * The same mismatch happens when a learner opens the app as `127.0.0.1` while
 * `Host` is `localhost` (or the reverse) on the *same* port.
 *
 * For undeployed local workshops only, align headers in those two cases.
 * Different loopback ports are left alone so a page on another local port
 * cannot satisfy CSRF by getting `Host` rewritten. Deployed workshops keep
 * strict proxy header behavior. Cross-site scanner Origins are unchanged.
 */
export function isLoopbackHost(host: string) {
	try {
		// Host may include a port; URL parsing splits hostname safely for
		// localhost, IPv4, and bracketed IPv6 (e.g. [::1]:5639). Node may keep
		// the brackets on IPv6 hostnames, so accept both forms.
		const hostname = new URL(`http://${host}`).hostname.toLowerCase()
		return (
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '::1' ||
			hostname === '[::1]'
		)
	} catch {
		return false
	}
}

export function getOriginHost(originHeader: string | undefined) {
	if (!originHeader || originHeader === 'null') return null
	try {
		return new URL(originHeader).host
	} catch {
		return null
	}
}

export function getHostPort(host: string) {
	try {
		return new URL(`http://${host}`).port
	} catch {
		return null
	}
}

export function shouldAlignLoopbackOriginHeaders({
	deployed,
	originHost,
	hostHeader,
	forwardedHostHeader,
}: {
	deployed: boolean
	originHost: string | null
	hostHeader: string | undefined
	forwardedHostHeader: string | undefined
}) {
	if (deployed || !originHost || !isLoopbackHost(originHost)) return false

	const forwardedHost = forwardedHostHeader?.split(',')[0]?.trim() || undefined

	// Classic Codespaces: Host already matches the loopback Origin; only
	// X-Forwarded-Host is the disagreeing public hostname.
	if (
		forwardedHost &&
		forwardedHost !== originHost &&
		hostHeader === originHost
	) {
		return true
	}

	// localhost vs 127.0.0.1 (same port only — different ports stay rejected)
	if (
		hostHeader &&
		hostHeader !== originHost &&
		isLoopbackHost(hostHeader) &&
		getHostPort(originHost) !== null &&
		getHostPort(originHost) === getHostPort(hostHeader)
	) {
		return true
	}

	return false
}

export function alignLoopbackOriginHeaders(
	req: Request,
	_res: Response,
	next: NextFunction,
) {
	const originHost = getOriginHost(
		typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
	)
	const forwarded = req.headers['x-forwarded-host']
	const forwardedHostHeader = Array.isArray(forwarded)
		? forwarded[0]
		: forwarded
	const hostHeader = Array.isArray(req.headers.host)
		? req.headers.host[0]
		: req.headers.host

	if (
		!shouldAlignLoopbackOriginHeaders({
			deployed: Boolean(ENV.EPICSHOP_DEPLOYED),
			originHost,
			hostHeader,
			forwardedHostHeader,
		})
	) {
		return next()
	}

	// originHost is non-null when shouldAlign... is true
	req.headers.host = originHost!
	delete req.headers['x-forwarded-host']
	return next()
}
