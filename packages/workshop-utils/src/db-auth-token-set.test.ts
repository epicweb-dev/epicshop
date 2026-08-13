import { expect, test } from 'vitest'
import { TokenSetSchema } from './db.server.ts'

test('defaults missing OAuth token_type and scope (aha: EPICSHOP-HG)', () => {
	expect(TokenSetSchema.parse({ access_token: 'tok' })).toEqual({
		access_token: 'tok',
		token_type: 'Bearer',
		scope: '',
	})
})

test('defaults undefined OAuth token_type and scope (aha: EPICSHOP-HG)', () => {
	expect(
		TokenSetSchema.parse({
			access_token: 'tok',
			token_type: undefined,
			scope: undefined,
		}),
	).toEqual({
		access_token: 'tok',
		token_type: 'Bearer',
		scope: '',
	})
})

test('preserves provided OAuth token_type and scope', () => {
	expect(
		TokenSetSchema.parse({
			access_token: 'tok',
			token_type: 'Bearer',
			scope: 'openid profile',
		}),
	).toEqual({
		access_token: 'tok',
		token_type: 'Bearer',
		scope: 'openid profile',
	})
})
