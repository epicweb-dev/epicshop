import {
	getWorkshopInstructor,
	getWorkshopSubtitle,
	getWorkshopTitle,
} from '@epic-web/workshop-utils/apps.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { ImageResponse } from '@vercel/og'
import { OgLayout } from '#app/components/og.js'
import { getErrorMessage } from '#app/utils/misc.js'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const workshopTitle = await getWorkshopTitle()
	const title = url.searchParams.get('title') || workshopTitle
	const subtitle =
		url.searchParams.get('subtitle') || (await getWorkshopSubtitle())
	const urlPathname = url.searchParams.get('urlPathname') || url.pathname
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
						fontSize: '80px',
						fontWeight: 700,
						textWrap: 'balance',
						textAlign: 'center',
					}}
				>
					{title}
				</h1>
				{subtitle ? (
					<p
						style={{
							fontSize: '40px',
							fontWeight: 200,
							textWrap: 'balance',
							textAlign: 'center',
						}}
					>
						{subtitle}
					</p>
				) : null}
			</div>
		</OgLayout>
	)

	try {
		return new ImageResponse(element, {
			width: 1200,
			height: 630,
		})
	} catch (error) {
		return new Response(getErrorMessage(error), { status: 500 })
	}
}
