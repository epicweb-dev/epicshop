import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export default function Support() {
	const repoGroups = ENV.EPICSHOP_GITHUB_REPO.match(
		/github\.com\/(?<org>[^/?]+)\/(?<repo>[^/?]+)/,
	)?.groups

	let repoUrl = ENV.EPICSHOP_GITHUB_REPO
	let repoIssuesUrl = repoUrl
	if (repoGroups?.org && repoGroups.repo) {
		repoUrl = `https://github.com/${repoGroups.org}/${repoGroups.repo}`
		repoIssuesUrl = `${repoUrl}/issues`
	}
	return (
		<div className="container flex h-full max-w-3xl flex-col items-center justify-center gap-4 p-12">
			<h1 className="text-5xl font-bold">Support</h1>
			<p>
				We're here to support you! Depending on the kind of support you need,
				you will want to reach out in different places:
			</p>
			<ul className="flex list-disc flex-col gap-4">
				<li>
					<strong>Workshop App Guide:</strong>{' '}
					<Link to="/guide" className="underline">
						/guide
					</Link>{' '}
					– Learn how to use the workshop app effectively, including file links,
					keyboard shortcuts, and troubleshooting tips.
				</li>
				<li>
					<strong>Technical issues:</strong>{' '}
					<a href="mailto:team@epicweb.dev" className="underline">
						team@epicweb.dev
					</a>{' '}
					– Helpful if you're having trouble with or have feedback for your
					EpicWeb.dev account or access to course content.
				</li>
				<li>
					<strong>Workshop App:</strong>{' '}
					<a
						href="https://github.com/epicweb-dev/epicshop/issues"
						className="underline"
					>
						github.com/epicweb-dev/epicshop
					</a>{' '}
					– Helpful if you're having trouble with or feedback for the local
					workshop app.
				</li>
				<li>
					<strong>Workshop content:</strong>{' '}
					<a href={repoIssuesUrl} className="underline">
						{repoUrl.replace('https://', '')}
					</a>{' '}
					– Open an issue or pull request here to report an issue with the
					content of this workshop.
				</li>
				<li>
					<strong>Discord:</strong>{' '}
					<Link to="/discord" className="underline">
						/discord
					</Link>{' '}
					– Connect your account with discord to get access to the private forum
					and ask questions of other students and the workshop instructor.
				</li>
			</ul>
		</div>
	)
}
