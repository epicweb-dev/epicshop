import { redirect, type DataFunctionArgs } from '@remix-run/node'
import {
	DiscordMemberSchema,
	requireAuthInfo,
	setDiscordMember,
} from '#app/utils/db.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'

const port = process.env.PORT || '5639'
const scope = 'guilds.join identify messages.read'

export function getDiscordAuthURL() {
	const discordAuthUrl = new URL('https://discord.com/oauth2/authorize')
	discordAuthUrl.searchParams.append('client_id', '738096608440483870')
	discordAuthUrl.searchParams.append(
		'redirect_uri',
		`http://localhost:${port}/discord/callback`,
	)
	discordAuthUrl.searchParams.append('response_type', 'code')
	discordAuthUrl.searchParams.append('scope', scope)
	return discordAuthUrl.toString()
}

export async function loader({ request }: DataFunctionArgs) {
	const authInfo = await requireAuthInfo({ request })
	const discordCode = new URL(request.url).searchParams.get('code')
	invariantResponse(discordCode, 'Missing code')

	const result = await fetch(
		// 'http://localhost:3000/resources/connect-epic-web',
		'https://kcd-discord-bot-v2.fly.dev/resources/connect-epic-web',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				deviceToken: authInfo.tokenSet.access_token,
				discordCode,
				port,
				scope,
			}),
		},
	)
	if (!result.ok) {
		console.error(`There was an error connecting Discord`)
		try {
			console.error(await result.text())
		} catch {
		} finally {
			return redirect('/account?error')
		}
	}

	const jsonResult = await result.json()
	if (jsonResult.status === 'error') {
		console.error(`There was an error connecting Discord`)
		console.error(jsonResult.error)
		return redirect('/account?error')
	}

	const discordMemberResult = DiscordMemberSchema.safeParse(jsonResult.member)
	if (discordMemberResult.success) {
		await setDiscordMember(discordMemberResult.data)
		return redirect('/account?success')
	} else {
		console.error(`There was an error connecting Discord`)
		console.error(discordMemberResult.error)
		return redirect('/account?error')
	}
}
