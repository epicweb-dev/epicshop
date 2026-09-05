import { expect, test } from 'vitest'
import { DataSchema } from './db.server.ts'

test('defaults missing presence.optOut so empty presence is not corruption (aha: EPICSHOP-HY)', () => {
	expect(
		DataSchema.parse({
			preferences: {
				presence: {},
			},
		}).preferences.presence.optOut,
	).toBe(false)
})

test('defaults undefined presence.optOut (aha: EPICSHOP-HY)', () => {
	expect(
		DataSchema.parse({
			preferences: {
				presence: { optOut: undefined },
			},
		}).preferences.presence.optOut,
	).toBe(false)
})

test('defaults omitted presence preferences', () => {
	expect(DataSchema.parse({}).preferences.presence.optOut).toBe(false)
})

test('preserves an explicit presence optOut', () => {
	expect(
		DataSchema.parse({
			preferences: {
				presence: { optOut: true },
			},
		}).preferences.presence.optOut,
	).toBe(true)
})
