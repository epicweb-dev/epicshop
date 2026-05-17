import { expect, test } from 'vitest'
import {
	isProcessingPictureInPictureRequest,
	processingPictureInPictureRequestMessage,
} from '../app/utils/sentry-filters.ts'

test('matches the Picture-in-Picture processing DOMException exactly', () => {
	expect(
		isProcessingPictureInPictureRequest({
			exception: {
				values: [
					{
						type: 'NotAllowedError',
						value: processingPictureInPictureRequestMessage,
					},
				],
			},
		}),
	).toBe(true)
})

test('does not match unrelated NotAllowedError exceptions', () => {
	expect(
		isProcessingPictureInPictureRequest({
			exception: {
				values: [
					{
						type: 'NotAllowedError',
						value: 'Permission denied.',
					},
				],
			},
		}),
	).toBe(false)
})

test('does not match the same message on a different exception type', () => {
	expect(
		isProcessingPictureInPictureRequest({
			exception: {
				values: [
					{
						type: 'SecurityError',
						value: processingPictureInPictureRequestMessage,
					},
				],
			},
		}),
	).toBe(false)
})
