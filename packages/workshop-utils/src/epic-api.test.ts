import { describe, test, expect } from 'vitest'
import { z } from 'zod'

// Extract the UserInfoSchema for testing
const UserInfoSchema = z
	.object({
		id: z.string(),
		name: z.string().nullable(),
		email: z.string().email(),
		image: z.string().nullable(),
		discordProfile: z
			.object({
				nick: z.string().nullable().optional(),
				user: z.object({
					id: z.string(),
					username: z.string(),
					avatar: z.string().nullable().optional(),
					global_name: z.string().nullable().optional(),
				}).optional(),
			})
			.nullable()
			.optional(),
	})
	.transform((data) => {
		return {
			...data,
			imageUrlSmall: data.image ?? `https://www.gravatar.com/avatar/test?size=64&default=identicon`,
			imageUrlLarge: data.image ?? `https://www.gravatar.com/avatar/test?size=512&default=identicon`,
		}
	})

describe('UserInfoSchema Discord Profile Validation', () => {
	test('should handle valid user info with complete discord profile', () => {
		const validUserInfo = {
			id: '123',
			name: 'Test User',
			email: 'test@example.com',
			image: 'https://example.com/avatar.jpg',
			discordProfile: {
				nick: 'testnick',
				user: {
					id: '456',
					username: 'testuser',
					avatar: 'avatar123',
					global_name: 'Test Global Name',
				},
			},
		}

		const result = UserInfoSchema.safeParse(validUserInfo)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discordProfile?.nick).toBe('testnick')
			expect(result.data.discordProfile?.user.username).toBe('testuser')
		}
	})

	test('should handle user info with null discord profile', () => {
		const userInfoWithNullDiscord = {
			id: '123',
			name: 'Test User',
			email: 'test@example.com',
			image: 'https://example.com/avatar.jpg',
			discordProfile: null,
		}

		const result = UserInfoSchema.safeParse(userInfoWithNullDiscord)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discordProfile).toBe(null)
		}
	})

	test('should handle user info without discord profile', () => {
		const userInfoWithoutDiscord = {
			id: '123',
			name: 'Test User',
			email: 'test@example.com',
			image: 'https://example.com/avatar.jpg',
		}

		const result = UserInfoSchema.safeParse(userInfoWithoutDiscord)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discordProfile).toBeUndefined()
		}
	})

	test('should handle discord profile with missing nick field (reproduce issue)', () => {
		const userInfoWithPartialDiscord = {
			id: '123',
			name: 'Test User',
			email: 'test@example.com',
			image: 'https://example.com/avatar.jpg',
			discordProfile: {
				user: {
					id: '456',
					username: 'testuser',
				},
			},
		}

		const result = UserInfoSchema.safeParse(userInfoWithPartialDiscord)
		// After fix: This should now pass
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discordProfile?.nick).toBeUndefined()
			expect(result.data.discordProfile?.user?.username).toBe('testuser')
		}
	})

	test('should handle discord profile with missing user field (reproduce issue)', () => {
		const userInfoWithPartialDiscord = {
			id: '123',
			name: 'Test User',
			email: 'test@example.com',
			image: 'https://example.com/avatar.jpg',
			discordProfile: {
				nick: 'testnick',
			},
		}

		const result = UserInfoSchema.safeParse(userInfoWithPartialDiscord)
		// After fix: This should now pass
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discordProfile?.nick).toBe('testnick')
			expect(result.data.discordProfile?.user).toBeUndefined()
		}
	})

	test('should handle empty discord profile object (reproduce issue)', () => {
		const userInfoWithEmptyDiscord = {
			id: '123',
			name: 'Test User',
			email: 'test@example.com',
			image: 'https://example.com/avatar.jpg',
			discordProfile: {},
		}

		const result = UserInfoSchema.safeParse(userInfoWithEmptyDiscord)
		// After fix: This should now pass
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discordProfile?.nick).toBeUndefined()
			expect(result.data.discordProfile?.user).toBeUndefined()
		}
	})
})