import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from 'node:crypto'

export const OFFLINE_VIDEO_BLOCK_SIZE = 16
export const OFFLINE_VIDEO_CRYPTO_VERSION = 1

export type OfflineVideoKeyInfo = {
	key: Buffer
	keyId: string
}

export type OfflineVideoCryptoRange = {
	alignedStart: number
	alignedEnd: number
	skipBytes: number
	takeBytes: number
	blockIndex: number
}

export function createOfflineVideoSalt() {
	return randomBytes(32).toString('base64')
}

export function createOfflineVideoIv() {
	return randomBytes(OFFLINE_VIDEO_BLOCK_SIZE)
}

export function encodeOfflineVideoIv(iv: Buffer) {
	return iv.toString('base64')
}

export function decodeOfflineVideoIv(ivBase64: string) {
	return Buffer.from(ivBase64, 'base64')
}

export function deriveOfflineVideoKey({
	salt,
	clientId,
	userId,
	version,
}: {
	salt: string
	clientId: string
	userId: string | null
	version: number
}): OfflineVideoKeyInfo {
	const keyInput = `${version}:${salt}:${clientId}:${userId ?? 'anonymous'}`
	const key = createHash('sha256').update(keyInput).digest()
	const keyId = createHash('sha256').update(key).digest('hex').slice(0, 12)
	return { key, keyId }
}

export function incrementIv(iv: Buffer, blockIndex: number) {
	const base = BigInt(`0x${iv.toString('hex')}`)
	const next = base + BigInt(blockIndex)
	const hex = next.toString(16).padStart(OFFLINE_VIDEO_BLOCK_SIZE * 2, '0')
	return Buffer.from(hex, 'hex')
}

export function getCryptoRange({
	start,
	end,
	blockSize = OFFLINE_VIDEO_BLOCK_SIZE,
}: {
	start: number
	end: number
	blockSize?: number
}): OfflineVideoCryptoRange {
	const alignedStart = Math.floor(start / blockSize) * blockSize
	const alignedEnd = Math.floor(end / blockSize) * blockSize + (blockSize - 1)
	const skipBytes = start - alignedStart
	const takeBytes = end - start + 1
	const blockIndex = alignedStart / blockSize
	return { alignedStart, alignedEnd, skipBytes, takeBytes, blockIndex }
}

export function createOfflineVideoCipher({
	key,
	iv,
}: {
	key: Buffer
	iv: Buffer
}) {
	return createCipheriv('aes-256-ctr', key, iv)
}

export function createOfflineVideoDecipher({
	key,
	iv,
}: {
	key: Buffer
	iv: Buffer
}) {
	return createDecipheriv('aes-256-ctr', key, iv)
}
