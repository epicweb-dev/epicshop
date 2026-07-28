import { type NextFunction, type Request, type Response } from 'express'

/**
 * GitHub Codespaces (and similar port-forward proxies) often rewrite the
 * browser `Origin` to `localhost:<port>` while setting `X-Forwarded-Host` to
 * the public `*.app.github.dev` host. React Router's single-fetch CSRF check
 * prefers `X-Forwarded-Host`, so legitimate same-tab POSTs fail with 400 and
 * the client surfaces React Router's opaque "Unexpected Server Error".
 *
 * The same mismatch happens when a learner opens the app as `127.0.0.1` while
 * `Host` is `localhost` (or the reverse).
 *
 * For undeployed local workshops only, when `Origin` is a loopback host, align
 * `Host` / `X-Forwarded-Host` to that Origin so CSRF compares equal hosts.
 * Deployed workshops keep strict proxy header behavior. Cross-site scanner
 * Origins (not loopback) are unchanged and still rejected.
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
	const forwardedHost = forwardedHostHeader?.split(',')[0]?.trim()
	return (
		(Boolean(forwardedHost) && forwardedHost !== originHost) ||
		(Boolean(hostHeader) && hostHeader !== originHost)
	)
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
