import { invariantResponse } from '@epic-web/invariant'
import { redirect, type LoaderFunctionArgs } from 'react-router'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariantResponse(params.example, 'example is required')
	const url = new URL(request.url)
	return redirect(`/extra/${params.example}${url.search}`)
}

export default function ExampleRedirect() {
	return null
}
