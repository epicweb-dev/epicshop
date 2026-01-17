import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import {
	OFFLINE_VIDEO_BLOCK_SIZE,
	decodeOfflineVideoIv,
	deriveOfflineVideoKey,
	encodeOfflineVideoIv,
	getCryptoRange,
	incrementIv,
} from './offline-video-crypto.server.ts'

test('deriveOfflineVideoKey is deterministic and user specific', () => {
	const base = {
		salt: 'test-salt',
		clientId: 'client-123',
		version: 1,
	}
	const first = deriveOfflineVideoKey({ ...base, userId: 'user-a' })
	const second = deriveOfflineVideoKey({ ...base, userId: 'user-a' })
	const third = deriveOfflineVideoKey({ ...base, userId: 'user-b' })

	expect(first.keyId).toBe(second.keyId)
	expect(first.keyId).not.toBe(third.keyId)
})

test('incrementIv advances the counter', () => {
	const iv = Buffer.from('000000000000000000000000000000ff', 'hex')
	const next = incrementIv(iv, 1)
	expect(next.toString('hex')).toBe('00000000000000000000000000000100')
})

test('getCryptoRange aligns to block boundaries', () => {
	const range = getCryptoRange({ start: 10, end: 25 })
	expect(range.alignedStart).toBe(0)
	expect(range.alignedEnd).toBe(31)
	expect(range.skipBytes).toBe(10)
	expect(range.takeBytes).toBe(16)
})

test('getCryptoRange keeps aligned ranges intact', () => {
	const range = getCryptoRange({ start: 16, end: 31 })
	expect(range.alignedStart).toBe(16)
	expect(range.alignedEnd).toBe(31)
	expect(range.skipBytes).toBe(0)
	expect(range.takeBytes).toBe(16)
})

test('range decrypt matches plaintext slice', () => {
	const key = randomBytes(32)
	const iv = randomBytes(OFFLINE_VIDEO_BLOCK_SIZE)
	const plaintext = Buffer.from(Array.from({ length: 128 }, (_, i) => i))

	const cipher = createCipheriv('aes-256-ctr', key, iv)
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

	const start = 13
	const end = 73
	const range = getCryptoRange({ start, end })
	const alignedEnd = Math.min(range.alignedEnd, encrypted.length - 1)
	const encryptedSlice = encrypted.slice(range.alignedStart, alignedEnd + 1)

	const rangeIv = incrementIv(iv, range.blockIndex)
	const decipher = createDecipheriv('aes-256-ctr', key, rangeIv)
	const decryptedSlice = Buffer.concat([
		decipher.update(encryptedSlice),
		decipher.final(),
	])
	const result = decryptedSlice.slice(
		range.skipBytes,
		range.skipBytes + range.takeBytes,
	)

	expect(result).toEqual(plaintext.slice(start, end + 1))
})

test('encode/decode IV roundtrip', () => {
	const iv = randomBytes(OFFLINE_VIDEO_BLOCK_SIZE)
	const encoded = encodeOfflineVideoIv(iv)
	const decoded = decodeOfflineVideoIv(encoded)
	expect(decoded.toString('hex')).toBe(iv.toString('hex'))
})
