import {
	getWorkshopInstructor,
	getWorkshopSubtitle,
	getWorkshopTitle,
} from '@epic-web/workshop-utils/apps.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { ImageResponse } from '@vercel/og'
import { renderToStaticMarkup } from 'react-dom/server'
import { OgLayout } from '#app/components/og.js'
import { getErrorMessage } from '#app/utils/misc.js'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const workshopTitle = await getWorkshopTitle()
	const title = url.searchParams.get('title') || workshopTitle
	const subtitle =
		url.searchParams.get('subtitle') || (await getWorkshopSubtitle())
	const urlPathname = url.searchParams.get('urlPathname') || ''
	const element = (
		<OgLayout
			request={request}
			instructor={await getWorkshopInstructor()}
			urlPathname={urlPathname}
			workshopTitle={workshopTitle === title ? null : workshopTitle}
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

	if (url.searchParams.get('html') === 'true') {
		return new Response(renderToStaticMarkup(element), {
			headers: { 'Content-Type': 'text/html' },
		})
	}

	try {
		return new ImageResponse(element, {
			width: 1200,
			height: 630,
			debug: url.searchParams.get('debug') === 'true',
		})
	} catch (error) {
		return new Response(getErrorMessage(error), { status: 500 })
	}
}
