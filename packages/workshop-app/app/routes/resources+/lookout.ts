import { invariantResponse } from '@epic-web/invariant'
import { type Route } from './+types/lookout'

const SENTRY_HOST = new URL(ENV.SENTRY_DSN).hostname
const SENTRY_PROJECT_IDS = [ENV.SENTRY_PROJECT_ID]

// This route only accepts POST, but without a loader React Router turns a GET
// into a reported internal server error instead of a 405.
export function loader() {
	return new Response('Method Not Allowed', {
		status: 405,
		headers: { Allow: 'POST' },
	})
}

function parseEnvelopeHeader(piece: string) {
	try {
		return JSON.parse(piece) as { dsn: string }
	} catch {
		// A SyntaxError here would escape as a reported 500, but a body that
		// isn't a Sentry envelope is the caller's mistake.
		throw new Response('Invalid sentry envelope', { status: 400 })
	}
}

export async function action({ request }: Route.ActionArgs) {
	const envelope = await request.text()
	const piece = envelope.split('\n')[0]
	invariantResponse(piece, 'no piece in envelope')

	const header = parseEnvelopeHeader(piece)
	const dsn = new URL(header.dsn)
	const projectId = dsn.pathname?.replace('/', '')

	invariantResponse(
		dsn.hostname === SENTRY_HOST,
		`Invalid sentry hostname: ${dsn.hostname}`,
	)
	invariantResponse(
		projectId && SENTRY_PROJECT_IDS.includes(projectId),
		`Invalid sentry project id: ${projectId}`,
	)

	const upstreamSentryURL = `https://${SENTRY_HOST}/api/${projectId}/envelope/`
	try {
		return await fetch(upstreamSentryURL, { method: 'POST', body: envelope })
	} catch (error) {
		console.error(`Error forwarding Sentry event: ${error}`)
		return new Response('Sentry event not forwarded due to network error', {
			status: 200,
		})
	}
}
