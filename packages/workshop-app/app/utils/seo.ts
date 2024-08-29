import { type getWorkshopConfig } from '@epic-web/workshop-utils/config.server'

export function getSeoMetaTags({
	title,
	description,
	instructor,
	requestInfo,
	ogTitle = title,
	ogDescription = description,
	ogImageUrl = requestInfo.domain +
		'/og?' +
		new URLSearchParams({
			title: ogTitle,
			subtitle: ogDescription ?? '',
			urlPathname: requestInfo.path,
			// to make cache busting possible, whenever the og image changes, we can change the version
			// note if the inputs change, then the cache will be busted automatically
			// it's only if the image changes that we need to change the version
			version: 'v4',
		}).toString(),
	ogImageAlt = title,
}: {
	title: string
	requestInfo: { domain: string; path: string }
	description?: string
	instructor: Partial<ReturnType<typeof getWorkshopConfig>['instructor']>
	ogTitle?: string
	ogDescription?: string
	ogImageUrl?: string
	ogImageAlt?: string
}) {
	return [
		{ title: title },
		description ? { description } : null,
		instructor?.name ? { name: 'author', content: instructor.name } : null,
		{ name: 'og:site_name', content: title },
		{ name: 'twitter:card', content: 'summary_large_image' },
		{ name: 'twitter:creator', content: instructor?.['𝕏'] },
		{ name: 'og:title', content: ogTitle },
		description ? { name: 'og:description', content: ogDescription } : null,
		{ name: 'og:type', content: 'website' },
		{ name: 'og:image:width', content: '1200' },
		{ name: 'og:image:height', content: '630' },
		{ name: 'og:image:alt', content: ogImageAlt },
		{ name: 'og:image', content: ogImageUrl },
	].filter(Boolean)
}
