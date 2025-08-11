import { test, expect, describe } from 'vitest'
import {
	UserSchema,
	MessageSchema,
	PresenceSchema,
	type User,
	type Message,
} from './presence.js'

describe('UserSchema', () => {
	test('should validate a valid user object', () => {
		const validUser = {
			id: 'user123',
			hasAccess: true,
			name: 'John Doe',
			imageUrlSmall: 'https://example.com/small.jpg',
			imageUrlLarge: 'https://example.com/large.jpg',
			location: {
				workshopTitle: 'React Workshop',
				origin: 'https://workshop.example.com',
				exercise: {
					type: 'problem' as const,
					exerciseNumber: 1,
					stepNumber: 2,
				},
			},
		}

		const result = UserSchema.safeParse(validUser)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(validUser)
		}
	})

	test('should validate minimal user object', () => {
		const minimalUser = {
			id: 'user123',
		}

		const result = UserSchema.safeParse(minimalUser)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(minimalUser)
		}
	})

	test('should reject user without id', () => {
		const invalidUser = {
			name: 'John Doe',
			hasAccess: true,
		}

		const result = UserSchema.safeParse(invalidUser)
		expect(result.success).toBe(false)
	})

	test('should handle user with invalid location type', () => {
		const userWithInvalidLocation = {
			id: 'user123',
			location: {
				workshopTitle: 'React Workshop',
				origin: 'https://workshop.example.com',
				exercise: {
					type: 'invalid-type' as any,
					exerciseNumber: 1,
					stepNumber: 2,
				},
			},
		}

		const result = UserSchema.safeParse(userWithInvalidLocation)
		expect(result.success).toBe(false)
	})

	test('should handle user with missing required location fields', () => {
		const userWithIncompleteLocation = {
			id: 'user123',
			location: {
				workshopTitle: 'React Workshop',
				// Missing origin and exercise - but these are optional
			},
		}

		const result = UserSchema.safeParse(userWithIncompleteLocation)
		// Location fields are optional, so this should succeed
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.location?.workshopTitle).toBe('React Workshop')
		}
	})

	test('should validate user with all optional fields', () => {
		const fullUser = {
			id: 'user123',
			hasAccess: false,
			name: 'Jane Smith',
			imageUrlSmall: 'https://example.com/jane-small.jpg',
			imageUrlLarge: 'https://example.com/jane-large.jpg',
		}

		const result = UserSchema.safeParse(fullUser)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(fullUser)
		}
	})
})

describe('MessageSchema', () => {
	test('should validate add-user message', () => {
		const addUserMessage = {
			type: 'add-user' as const,
			payload: {
				id: 'user123',
				name: 'John Doe',
				hasAccess: true,
			},
		}

		const result = MessageSchema.safeParse(addUserMessage)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(addUserMessage)
		}
	})

	test('should validate remove-user message', () => {
		const removeUserMessage = {
			type: 'remove-user' as const,
			payload: {
				id: 'user123',
			},
		}

		const result = MessageSchema.safeParse(removeUserMessage)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(removeUserMessage)
		}
	})

	test('should validate presence message', () => {
		const presenceMessage = {
			type: 'presence' as const,
			payload: {
				users: [
					{ id: 'user1', name: 'User 1' },
					{ id: 'user2', name: 'User 2' },
				],
			},
		}

		const result = MessageSchema.safeParse(presenceMessage)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(presenceMessage)
		}
	})

	test('should reject invalid message type', () => {
		const invalidMessage = {
			type: 'invalid-type',
			payload: { id: 'user123' },
		}

		const result = MessageSchema.safeParse(invalidMessage)
		expect(result.success).toBe(false)
	})

	test('should reject message without payload', () => {
		const messageWithoutPayload = {
			type: 'add-user',
		}

		const result = MessageSchema.safeParse(messageWithoutPayload)
		expect(result.success).toBe(false)
	})

	test('should reject add-user message with invalid payload', () => {
		const invalidAddUserMessage = {
			type: 'add-user' as const,
			payload: {
				// Missing required id field
				name: 'John Doe',
			},
		}

		const result = MessageSchema.safeParse(invalidAddUserMessage)
		expect(result.success).toBe(false)
	})

	test('should reject presence message with invalid users array', () => {
		const invalidPresenceMessage = {
			type: 'presence' as const,
			payload: {
				users: [
					{ name: 'User 1' }, // Missing required id field
					{ id: 'user2', name: 'User 2' },
				],
			},
		}

		const result = MessageSchema.safeParse(invalidPresenceMessage)
		expect(result.success).toBe(false)
	})
})

describe('PresenceSchema', () => {
	test('should validate presence object', () => {
		const presence = {
			users: [
				{ id: 'user1', name: 'User 1' },
				{ id: 'user2', name: 'User 2' },
			],
		}

		const result = PresenceSchema.safeParse(presence)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(presence)
		}
	})

	test('should validate empty users array', () => {
		const presence = {
			users: [],
		}

		const result = PresenceSchema.safeParse(presence)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(presence)
		}
	})

	test('should reject presence without users array', () => {
		const invalidPresence = {}

		const result = PresenceSchema.safeParse(invalidPresence)
		expect(result.success).toBe(false)
	})

	test('should reject presence with invalid users array', () => {
		const invalidPresence = {
			users: 'not-an-array',
		}

		const result = PresenceSchema.safeParse(invalidPresence)
		expect(result.success).toBe(false)
	})

	test('should validate presence with users having complex data', () => {
		const complexPresence = {
			users: [
				{
					id: 'user1',
					name: 'User 1',
					hasAccess: true,
					imageUrlSmall: 'https://example.com/user1-small.jpg',
					location: {
						workshopTitle: 'Advanced React',
						origin: 'https://workshop.example.com',
						exercise: {
							type: 'solution' as const,
							exerciseNumber: 3,
							stepNumber: 1,
						},
					},
				},
			],
		}

		const result = PresenceSchema.safeParse(complexPresence)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data).toEqual(complexPresence)
		}
	})
})

describe('Type Inference', () => {
	test('User type should be correctly inferred', () => {
		const user: User = {
			id: 'user123',
			name: 'Test User',
			hasAccess: true,
		}

		expect(user.id).toBe('user123')
		expect(user.name).toBe('Test User')
		expect(user.hasAccess).toBe(true)
	})

	test('Message type should be correctly inferred', () => {
		const message: Message = {
			type: 'add-user',
			payload: {
				id: 'user123',
				name: 'Test User',
			},
		}

		expect(message.type).toBe('add-user')
		expect(message.payload.id).toBe('user123')
	})

	test('should handle discriminated union types correctly', () => {
		const addMessage: Message = {
			type: 'add-user',
			payload: { id: 'user1' },
		}

		const removeMessage: Message = {
			type: 'remove-user',
			payload: { id: 'user1' },
		}

		const presenceMessage: Message = {
			type: 'presence',
			payload: { users: [] },
		}

		expect(addMessage.type).toBe('add-user')
		expect(removeMessage.type).toBe('remove-user')
		expect(presenceMessage.type).toBe('presence')
	})
})
