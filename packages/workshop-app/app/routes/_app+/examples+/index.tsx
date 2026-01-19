import { redirect, type LoaderFunctionArgs } from 'react-router'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	return redirect(`/extra${url.search}`)
}

export default function ExamplesIndexRedirect() {
	return null
}
