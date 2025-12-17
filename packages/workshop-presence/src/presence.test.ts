import { test, expect } from 'vitest'
import {
	UserSchema,
	MessageSchema,
	PresenceSchema,
	type User,
	type Message,
} from './presence.ts'

test('UserSchema should validate a valid user object', () => {
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

test('UserSchema should validate minimal user object', () => {
	const minimalUser = {
		id: 'user123',
	}

	const result = UserSchema.safeParse(minimalUser)
	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toEqual(minimalUser)
	}
})

test('UserSchema should reject user without id', () => {
	const invalidUser = {
		name: 'John Doe',
		hasAccess: true,
	}

	const result = UserSchema.safeParse(invalidUser)
	expect(result.success).toBe(false)
})

test('MessageSchema should validate add-user message', () => {
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

test('MessageSchema should validate remove-user message', () => {
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

test('MessageSchema should validate presence message', () => {
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

test('MessageSchema should reject invalid message type', () => {
	const invalidMessage = {
		type: 'invalid-type',
		payload: { id: 'user123' },
	}

	const result = MessageSchema.safeParse(invalidMessage)
	expect(result.success).toBe(false)
})

test('PresenceSchema should validate presence object', () => {
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

test('PresenceSchema should validate empty users array', () => {
	const presence = {
		users: [],
	}

	const result = PresenceSchema.safeParse(presence)
	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data).toEqual(presence)
	}
})

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
