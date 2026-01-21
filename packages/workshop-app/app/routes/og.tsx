import { invariant } from '@epic-web/invariant'
import { cachified, ogCache } from '@epic-web/workshop-utils/cache.server'
import { getWorkshopConfig } from '@epic-web/workshop-utils/config.server'
import {
	type Timings,
	makeTimings,
} from '@epic-web/workshop-utils/timing.server'
import { Resvg } from '@resvg/resvg-js'
import { renderToStaticMarkup } from 'react-dom/server'
import { type LoaderFunctionArgs } from 'react-router'
import satori, { type SatoriOptions } from 'satori'
import { z } from 'zod'
import { getDomainUrl, getErrorMessage } from '#app/utils/misc.tsx'

const WIDTH = 1200
const HEIGHT = 630
const OgImageSchema = z.instanceof(Buffer)

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('og', 'og image loader')
	const url = new URL(request.url)
	const workshopConfig = getWorkshopConfig()
	const title = url.searchParams.get('title') || workshopConfig.title
	const subtitle = url.searchParams.get('subtitle') || workshopConfig.subtitle
	const urlPathname = url.searchParams.get('urlPathname') || ''
	const logo = workshopConfig.product.logo.startsWith('http')
		? workshopConfig.product.logo
		: new URL(workshopConfig.product.logo, getDomainUrl(request)).toString()

	const element = (
		<OgLayout
			request={request}
			instructor={workshopConfig.instructor}
			urlPathname={urlPathname}
			workshopTitle={
				workshopConfig.title === title ? null : workshopConfig.title
			}
			productLogo={logo}
			productDisplayName={workshopConfig.product.displayName}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					alignItems: 'center',
					height: '100%',
					width: '100%',
					color: 'white',
					padding: 100,
				}}
			>
				<h1
					style={{
						display: 'flex',
						justifyContent: 'center',
						fontSize: '80px',
						// https://github.com/vercel/satori/issues/498
						textWrap: title.includes(' ') ? 'balance' : 'initial',
						textAlign: 'center',
						width: '100%',
					}}
				>
					{title}
				</h1>
				{subtitle ? (
					<p
						style={{
							display: 'flex',
							justifyContent: 'center',
							fontSize: '40px',
							// https://github.com/vercel/satori/issues/498
							textWrap: subtitle.includes(' ') ? 'balance' : 'initial',
							textAlign: 'center',
							width: '100%',
						}}
					>
						{subtitle}
					</p>
				) : null}
			</div>
		</OgLayout>
	)

	const renderHtml = url.searchParams.get('html')
	if (renderHtml === 'true') {
		return new Response(renderToStaticMarkup(element), {
			headers: { 'Content-Type': 'text/html' },
		})
	}

	const debug = url.searchParams.get('debug') === 'true'

	try {
		const ogImg = await cachified({
			request,
			timings,
			timingKey: 'og-image',
			// if debug is true, then force, otherwise use undefined and it'll be derived from the request
			forceFresh: debug ? debug : undefined,
			key: request.url,
			cache: ogCache,
			ttl: 1000 * 60 * 60 * 24 * 7,
			staleWhileRevalidate: 1000 * 60 * 60 * 24 * 365,
			checkValue: OgImageSchema,
			getFreshValue: async () => {
				return await getOgImg(element, { request, timings })
			},
		})
		// @ts-ignore 🤷‍♂️ CLI doesn't like this but editor is fine 🙃
		return new Response(ogImg, {
			headers: {
				'Cache-Control':
					ENV.EPICSHOP_DEPLOYED && !(debug || url.searchParams.has('fresh'))
						? 'public, max-age=31536000, immutable'
						: 'no-cache no-store',
				'Content-Type': 'image/png',
				'Server-Timing': timings.toString(),
			},
		})
	} catch (error) {
		return new Response(getErrorMessage(error), {
			status: 500,
			headers: { 'Server-Timing': timings.toString() },
		})
	}
}

async function getOgImg(
	jsx: React.ReactNode,
	{ request, timings }: { request: Request; timings: Timings },
) {
	const url = new URL(request.url)
	const svg = await satori(jsx, {
		width: WIDTH,
		height: HEIGHT,
		debug: url.searchParams.get('debug') === 'true',
		fonts: await Promise.all([
			getFont({ font: 'Josefin Sans', request, timings }),
		]).then((fonts) => fonts.flat()),
		loadAdditionalAsset: async (code: string, segment: string) => {
			if (code === 'emoji') {
				const svg = await getEmoji(segment, { request, timings })
				if (!svg) return ''
				const base64 = Buffer.from(svg).toString('base64')
				return `data:image/svg+xml;base64,${base64}`
			}

			console.error(`Unhandled asset code: "${code}" for segment "${segment}"`)

			return ''
		},
	})

	const resvg = new Resvg(svg)
	const pngData = resvg.render()
	const data = pngData.asPng()

	return data
}

async function getEmoji(
	emoji: string,
	{ request, timings }: { request: Request; timings: Timings },
) {
	const emojiCode = emojiToCodePoints(emoji)
	if (!emojiCode) return null
	const emojiUrl = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15/assets/svg/${emojiCode}.svg`
	return cachified({
		cache: ogCache,
		key: emojiUrl,
		request,
		timings,
		timingKey: `loading ${emojiCode}`,
		checkValue: z.string(),
		getFreshValue: async () => {
			const response = await fetch(emojiUrl)
			return response.text()
		},
	})
}

function emojiToCodePoints(emoji: string) {
	const codePoints = []
	for (let i = 0; i < emoji.length; i++) {
		const codePoint = emoji.codePointAt(i)
		if (!codePoint) continue
		codePoints.push(codePoint.toString(16))
		if (codePoint > 0xffff) {
			// Skip the next code unit for surrogate pairs
			i++
		}
	}
	return codePoints.join('-')
}

async function getFont({
	font,
	weights = [200, 300, 400, 500, 600, 700],
	timings,
	request,
}: {
	font: string
	weights?: Array<number>
	timings?: Timings
	request?: Request
}) {
	const weightsString = weights.join(';')
	const fetchUrl = `https://fonts.googleapis.com/css2?family=${font}:wght@${weightsString}`
	const css = await cachified({
		key: fetchUrl,
		cache: ogCache,
		timings,
		timingKey: `font-${font}`,
		request,
		checkValue: z.string(),
		getFreshValue: async () => {
			return fetch(fetchUrl, {
				headers: {
					// Make sure it returns TTF.
					'User-Agent':
						'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
				},
			}).then((response) => response.text())
		},
	})

	const resource = css.matchAll(
		/src: url\((.+)\) format\('(opentype|truetype)'\)/g,
	)

	return Promise.all(
		[...resource]
			.map((match) => match[1])
			.map((url) => {
				invariant(
					url,
					() => `Expected a URL to be parsed from the google font:\n${css}`,
				)
				return fetch(url).then((response) => response.arrayBuffer())
			})
			.map(async (buffer, i) => ({
				name: font,
				style: 'normal',
				weight: weights[i],
				data: await buffer,
			})),
	) as Promise<SatoriOptions['fonts']>
}

function OgLayout({
	instructor,
	children,
	request,
	urlPathname = new URL(request.url).pathname.replace(/\/og$/, ''),
	workshopTitle,
}: {
	instructor: ReturnType<typeof getWorkshopConfig>['instructor']
	request: Request
	children: React.ReactNode
	workshopTitle?: string | null
	urlPathname?: string | null
	productLogo: string
	productDisplayName: string
}) {
	const domain = getDomainUrl(request)
	const protocolFreeDomain = domain.replace(/^https?:\/\//, '')

	return (
		<div
			style={{
				fontFamily: 'Josefin Sans',
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				position: 'relative',
			}}
		>
			<div
				style={{
					display: 'flex',
					position: 'absolute',
					top: 0,
					right: 0,
					bottom: 0,
					left: 0,
					width: '100%',
					height: '100%',
					backgroundColor: '#080B16',
				}}
			>
				<img
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
						opacity: 0.3,
					}}
					src={`${domain}/og/background.png`}
				/>
			</div>
			<div style={{ display: 'flex', position: 'absolute', top: 20, left: 30 }}>
				<img height={56} src={`${domain}/og/logo.svg`} />
			</div>
			{instructor ? (
				<div
					style={{
						display: 'flex',
						gap: 8,
						justifyContent: 'center',
						alignItems: 'center',
						position: 'absolute',
						top: 20,
						right: 30,
					}}
				>
					{instructor.avatar ? (
						<img
							src={
								instructor.avatar.startsWith('/')
									? `${domain}${instructor.avatar}`
									: instructor.avatar
							}
							style={{
								width: 56,
								height: 56,
								borderRadius: '50%',
								objectFit: 'cover',
							}}
						/>
					) : null}
					{instructor.name ? (
						<h2
							style={{
								margin: 0,
								opacity: 0.8,
								color: 'white',
								fontSize: 30,
								fontWeight: 700,
							}}
						>
							{instructor.name}
						</h2>
					) : null}
				</div>
			) : null}
			{children}
			{workshopTitle ? (
				<div
					style={{
						display: 'flex',
						position: 'absolute',
						bottom: 20,
						left: 30,
						color: 'white',
						opacity: 0.8,
						fontSize: 20,
						fontWeight: 700,
					}}
				>
					{workshopTitle}
				</div>
			) : null}
			{urlPathname == null ? null : (
				<div
					style={{
						display: 'flex',
						position: 'absolute',
						bottom: 20,
						right: 30,
						color: 'white',
						opacity: 0.8,
						fontSize: 20,
						fontWeight: 700,
					}}
				>
					{protocolFreeDomain + urlPathname.replace(/\/$/, '')}
				</div>
			)}
		</div>
	)
}
