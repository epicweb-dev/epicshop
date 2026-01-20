import chalk from 'chalk'
import { matchSorter } from 'match-sorter'
import * as client from 'openid-client'
import { z } from 'zod'
import { assertCanPrompt } from '../utils/cli-runtime.js'

const EPIC_DOMAINS = [
	{
		host: 'www.epicweb.dev',
		displayName: 'EpicWeb.dev',
		description: 'Full-stack web development workshops',
	},
	{
		host: 'www.epicreact.dev',
		displayName: 'EpicReact.dev',
		description: 'React development workshops',
	},
	{
		host: 'www.epicai.pro',
		displayName: 'EpicAI.pro',
		description: 'AI development workshops',
	},
] as const

type EpicDomain = (typeof EPIC_DOMAINS)[number]

export type AuthResult = {
	success: boolean
	message?: string
	error?: Error
}

export type AuthStatusOptions = {
	silent?: boolean
}

export type AuthLoginOptions = {
	domain?: string
	silent?: boolean
}

export type AuthLogoutOptions = {
	domain?: string
	silent?: boolean
}

const TokenSetSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	scope: z.string(),
})

const AuthInfoSchema = z.object({
	id: z.string(),
	tokenSet: TokenSetSchema,
	email: z.string(),
	name: z.string().nullable().optional(),
})

const DataSchema = z.object({
	authInfos: z.record(z.string(), AuthInfoSchema).optional(),
})

async function loadAuthData() {
	const { loadJSON } =
		await import('@epic-web/workshop-utils/data-storage.server')
	const { data } = await loadJSON()
	if (!data) return null
	const result = DataSchema.safeParse(data)
	return result.success ? result.data : null
}

async function saveAuthData(
	host: string,
	authInfo: z.infer<typeof AuthInfoSchema> | null,
) {
	const { loadJSON, saveJSON } =
		await import('@epic-web/workshop-utils/data-storage.server')
	const { data } = await loadJSON()
	const currentData = (data ?? {}) as Record<string, unknown>
	const authInfos = (currentData.authInfos ?? {}) as Record<string, unknown>

	if (authInfo === null) {
		delete authInfos[host]
	} else {
		authInfos[host] = authInfo
	}

	await saveJSON({
		...currentData,
		authInfos,
	})
}

function getDomainByInput(input: string): EpicDomain | undefined {
	const normalized = input.toLowerCase().trim()
	return EPIC_DOMAINS.find(
		(d) =>
			d.host.toLowerCase() === normalized ||
			d.host.toLowerCase().replace('www.', '') === normalized ||
			d.displayName.toLowerCase() === normalized ||
			d.displayName.toLowerCase().replace('.dev', '').replace('.pro', '') ===
				normalized,
	)
}

async function selectDomain(
	message: string,
	silent: boolean,
): Promise<EpicDomain | null> {
	if (silent) {
		return null
	}

	assertCanPrompt({
		reason: 'select a domain',
		hints: [
			'Provide the domain argument (no prompt): npx epicshop auth login <domain>',
			'Examples: npx epicshop auth login epicweb.dev, npx epicshop auth login epicreact, npx epicshop auth login epicai',
		],
	})
	const { search } = await import('@inquirer/prompts')

	const choices = EPIC_DOMAINS.map((d) => ({
		name: d.displayName,
		value: d,
		description: d.description,
	}))

	try {
		return await search({
			message,
			source: async (input) => {
				if (!input) return choices
				return matchSorter(choices, input, {
					keys: ['name', 'value.host', 'description'],
				})
			},
		})
	} catch (error) {
		if ((error as Error).message === 'USER_QUIT') {
			return null
		}
		throw error
	}
}

/**
 * Show login status for all Epic domains
 */
export async function status(
	options: AuthStatusOptions = {},
): Promise<AuthResult> {
	const { silent = false } = options

	try {
		const data = await loadAuthData()
		const authInfos = data?.authInfos ?? {}

		if (!silent) {
			console.log(chalk.bold.cyan('\n🔐 Authentication Status\n'))

			for (const domain of EPIC_DOMAINS) {
				const authInfo = authInfos[domain.host]
				if (authInfo) {
					const name = authInfo.name ? ` (${authInfo.name})` : ''
					console.log(
						`  ${chalk.green('✓')} ${chalk.bold(domain.displayName)}: ${chalk.green('Logged in')} as ${chalk.cyan(authInfo.email)}${name}`,
					)
				} else {
					console.log(
						`  ${chalk.gray('○')} ${chalk.bold(domain.displayName)}: ${chalk.gray('Not logged in')}`,
					)
				}
			}

			console.log()
		}

		return { success: true }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Failed to get auth status: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Login to an Epic domain using device authorization flow
 */
export async function login(
	options: AuthLoginOptions = {},
): Promise<AuthResult> {
	const { domain: domainInput, silent = false } = options

	try {
		let domain: EpicDomain | null | undefined

		if (domainInput) {
			domain = getDomainByInput(domainInput)
			if (!domain) {
				const validDomains = EPIC_DOMAINS.map((d) => d.displayName).join(', ')
				const message = `Invalid domain: ${domainInput}. Valid domains: ${validDomains}`
				if (!silent) {
					console.error(chalk.red(`❌ ${message}`))
				}
				return { success: false, message }
			}
		} else {
			domain = await selectDomain('Select a domain to log in to:', silent)
			if (!domain) {
				return { success: false, message: 'No domain selected' }
			}
		}

		if (!silent) {
			console.log(chalk.cyan(`\n🔐 Logging in to ${domain.displayName}...\n`))
		}

		const issuer = `https://${domain.host}/oauth`

		const config = await client.discovery(new URL(issuer), 'EPICSHOP_APP')
		const deviceResponse = await client.initiateDeviceAuthorization(config, {})

		if (!silent) {
			console.log(
				chalk.bold(
					`To authenticate with ${domain.displayName}, complete login:`,
				),
			)
			console.log(
				`  1. Open: ${chalk.cyan.underline(deviceResponse.verification_uri_complete)}`,
			)
			console.log(
				`  2. Complete login by verifying this code: ${chalk.yellow.bold(deviceResponse.user_code)}`,
			)
			console.log()
			console.log(chalk.gray('Waiting for authorization...'))
		}

		// Use Promise.race to properly handle timeout
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error('Device authorization timed out'))
			}, deviceResponse.expires_in * 1000)
		})

		try {
			const tokenSet = await Promise.race([
				client.pollDeviceAuthorizationGrant(config, deviceResponse),
				timeoutPromise,
			])

			if (!tokenSet) {
				const message = 'No token received from authorization'
				if (!silent) {
					console.error(chalk.red(`❌ ${message}`))
				}
				return { success: false, message }
			}

			const UserInfoSchema = z.object({
				id: z.string(),
				email: z.string(),
				name: z.string().nullable().optional(),
			})

			const protectedResourceResponse = await client.fetchProtectedResource(
				config,
				tokenSet.access_token,
				new URL(`${issuer}/userinfo`),
				'GET',
			)
			const userinfoRaw = await protectedResourceResponse.json()
			const userinfoResult = UserInfoSchema.safeParse(userinfoRaw)

			if (!userinfoResult.success) {
				const message = `Failed to parse user info: ${userinfoResult.error.message}`
				if (!silent) {
					console.error(chalk.red(`❌ ${message}`))
				}
				return { success: false, message }
			}

			const userinfo = userinfoResult.data

			await saveAuthData(domain.host, {
				id: userinfo.id,
				tokenSet: {
					access_token: tokenSet.access_token,
					token_type: tokenSet.token_type ?? 'Bearer',
					scope: tokenSet.scope ?? '',
				},
				email: userinfo.email,
				name: userinfo.name,
			})

			if (!silent) {
				const name = userinfo.name ? ` (${userinfo.name})` : ''
				console.log(
					chalk.green(
						`\n✅ Successfully logged in to ${domain.displayName} as ${chalk.cyan(userinfo.email)}${name}`,
					),
				)
			}

			return { success: true, message: `Logged in to ${domain.displayName}` }
		} catch (error) {
			throw error
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Login failed: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}

/**
 * Logout from an Epic domain
 */
export async function logout(
	options: AuthLogoutOptions = {},
): Promise<AuthResult> {
	const { domain: domainInput, silent = false } = options

	try {
		const data = await loadAuthData()
		const authInfos = data?.authInfos ?? {}

		let domain: EpicDomain | null | undefined

		if (domainInput) {
			domain = getDomainByInput(domainInput)
			if (!domain) {
				const validDomains = EPIC_DOMAINS.map((d) => d.displayName).join(', ')
				const message = `Invalid domain: ${domainInput}. Valid domains: ${validDomains}`
				if (!silent) {
					console.error(chalk.red(`❌ ${message}`))
				}
				return { success: false, message }
			}
		} else {
			const loggedInDomains = EPIC_DOMAINS.filter((d) => authInfos[d.host])

			if (loggedInDomains.length === 0) {
				const message = 'Not logged in to any domains'
				if (!silent) {
					console.log(chalk.yellow(`⚠️  ${message}`))
				}
				return { success: true, message }
			}

			if (silent) {
				return { success: false, message: 'Domain required in silent mode' }
			}

			assertCanPrompt({
				reason: 'select a domain to log out from',
				hints: [
					'Provide the domain argument (no prompt): npx epicshop auth logout <domain>',
					'Examples: npx epicshop auth logout epicweb.dev, npx epicshop auth logout epicreact, npx epicshop auth logout epicai',
				],
			})
			const { search } = await import('@inquirer/prompts')

			const choices = loggedInDomains.map((d) => {
				const auth = authInfos[d.host]!
				return {
					name: `${d.displayName} (${auth.email})`,
					value: d,
					description: d.description,
				}
			})

			try {
				domain = await search({
					message: 'Select a domain to log out from:',
					source: async (input) => {
						if (!input) return choices
						return matchSorter(choices, input, {
							keys: ['name', 'value.host', 'description'],
						})
					},
				})
			} catch (error) {
				if ((error as Error).message === 'USER_QUIT') {
					return { success: false, message: 'Cancelled' }
				}
				throw error
			}
		}

		if (!domain) {
			return { success: false, message: 'No domain selected' }
		}

		if (!authInfos[domain.host]) {
			const message = `Not logged in to ${domain.displayName}`
			if (!silent) {
				console.log(chalk.yellow(`⚠️  ${message}`))
			}
			return { success: true, message }
		}

		await saveAuthData(domain.host, null)

		if (!silent) {
			console.log(
				chalk.green(`✅ Successfully logged out from ${domain.displayName}`),
			)
		}

		return { success: true, message: `Logged out from ${domain.displayName}` }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (!silent) {
			console.error(chalk.red(`❌ Logout failed: ${message}`))
		}
		return {
			success: false,
			message,
			error: error instanceof Error ? error : new Error(message),
		}
	}
}
