import { Link, useParams } from '@remix-run/react'

export default function Splat() {
	const params = useParams()

	return (
		<div>
			<div>You are at {params['*']}</div>
			<Link to="/">Go home</Link>
		</div>
	)
}
