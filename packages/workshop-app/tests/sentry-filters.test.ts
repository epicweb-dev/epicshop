import { expect, test } from 'vitest'
import {
	isAbortErrorNoise,
	isBrowserExtensionNoise,
	isBrowserNetworkNoise,
	isClientSentryNoise,
	isCrossOriginSecurityNoise,
	isDomMutationNoise,
	isPlaygroundClientNoise,
	isProcessingPictureInPictureRequest,
	isReactExtensionRenderLoopNoise,
	isSentryReplayIframeNoise,
	isSessionStorageAccessDenied,
	isStaleRouteResultNoise,
	isUnexpectedServerErrorNoise,
	pictureInPictureRequiresUserActivationMessage,
	processingPictureInPictureRequestMessage,
} from '../app/utils/sentry-filters.ts'
import { isServerEnvironmentNoise } from '../sentry-server-filters.js'

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

test('matches Firefox Picture-in-Picture user-activation NotAllowedError (aha)', () => {
	expect(
		isProcessingPictureInPictureRequest({
			exception: {
				values: [
					{
						type: 'NotAllowedError',
						value: pictureInPictureRequiresUserActivationMessage,
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isClientSentryNoise({
			exception: {
				values: [
					{
						type: 'NotAllowedError',
						value: pictureInPictureRequiresUserActivationMessage,
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
	expect(
		isProcessingPictureInPictureRequest({
			exception: {
				values: [
					{
						type: 'Error',
						value: pictureInPictureRequiresUserActivationMessage,
					},
				],
			},
		}),
	).toBe(false)
})

test('drops AbortError navigation/fetch aborts (aha)', () => {
	expect(
		isAbortErrorNoise({
			exception: {
				values: [
					{ type: 'AbortError', value: 'signal is aborted without reason' },
				],
			},
		}),
	).toBe(true)
	expect(
		isAbortErrorNoise({
			exception: {
				values: [{ type: 'AbortError', value: 'BodyStreamBuffer was aborted' }],
			},
		}),
	).toBe(true)
	expect(
		isAbortErrorNoise({
			exception: {
				values: [{ type: 'Error', value: 'Fetch is aborted' }],
			},
		}),
	).toBe(true)
})

test('drops stale single-fetch routeId misses after restart/deploy (aha)', () => {
	expect(
		isStaleRouteResultNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value: 'No result found for routeId "routes/$"',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isStaleRouteResultNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value:
							'No result found for routeId "routes/_app+/exercise+/$exerciseNumber"',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isStaleRouteResultNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value: 'Invalid response found for routeId "routes/_app+/index"',
					},
				],
			},
		}),
	).toBe(false)
	expect(
		isClientSentryNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value: 'No result found for routeId "routes/_app+/index"',
					},
				],
			},
		}),
	).toBe(true)
})

test('drops browser network flap messages even when deployed (aha)', () => {
	expect(
		isBrowserNetworkNoise({
			exception: {
				values: [
					{
						type: 'TypeError',
						value: 'Failed to fetch (fundamentals.epicreact.dev)',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isBrowserNetworkNoise({
			exception: {
				values: [
					{
						type: 'TypeError',
						value: 'NetworkError when attempting to fetch resource.',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isBrowserNetworkNoise({
			exception: {
				values: [{ type: 'TypeError', value: 'Load failed' }],
			},
		}),
	).toBe(true)
	expect(
		isBrowserNetworkNoise({
			exception: {
				values: [{ type: 'NS_ERROR_NOT_AVAILABLE', value: '' }],
			},
		}),
	).toBe(true)
})

test('drops sessionStorage SecurityError access denials', () => {
	expect(
		isSessionStorageAccessDenied({
			exception: {
				values: [
					{
						type: 'SecurityError',
						value:
							"Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.",
					},
				],
			},
		}),
	).toBe(true)
})

test('drops cross-origin / permission-denied browser sandbox noise', () => {
	expect(
		isCrossOriginSecurityNoise({
			exception: {
				values: [
					{
						type: 'SecurityError',
						value:
							'Permission denied to access property "Element" on cross-origin object',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isCrossOriginSecurityNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value: 'Permission denied to access property "apply"',
					},
				],
			},
		}),
	).toBe(true)
})

test('drops browser extension hooks and content-script timeouts (aha)', () => {
	expect(
		isBrowserExtensionNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value:
							'Request timeout for contentScriptVisibilityChanged (contentScriptVisibilityChanged 0e0962)',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isBrowserExtensionNoise({
			exception: {
				values: [
					{
						type: 'TypeError',
						value:
							"Cannot destructure property 'inBrowserBrowserRef' from null or undefined value",
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isBrowserExtensionNoise({
			exception: {
				values: [
					{
						type: 'TypeError',
						value: "Cannot read properties of null (reading 'tagName')",
						stacktrace: {
							frames: [{ filename: '<anonymous>', function: 'addEL_hook' }],
						},
					},
				],
			},
		}),
	).toBe(true)
})

test('drops DOM mutation races and playground client frames', () => {
	expect(
		isDomMutationNoise({
			exception: {
				values: [
					{
						type: 'NotFoundError',
						value:
							"Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isPlaygroundClientNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value:
							'Could not determine window of node. Node was [object HTMLButtonElement]',
						stacktrace: {
							frames: [
								{
									filename: '/app/playground/error-boundary.test.ts',
									function: 'getWindow',
								},
							],
						},
					},
				],
			},
		}),
	).toBe(true)
})

test('drops React render-loop fatals cascaded from addEL_hook extensions (aha)', () => {
	expect(
		isReactExtensionRenderLoopNoise({
			exception: {
				values: [
					{
						type: 'Error',
						value:
							'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.',
					},
				],
			},
			breadcrumbs: [
				{
					category: 'console',
					level: 'error',
					message:
						"TypeError: Cannot read properties of null (reading 'tagName')",
					data: {
						arguments: [
							{
								message: "Cannot read properties of null (reading 'tagName')",
								stack:
									"TypeError: Cannot read properties of null (reading 'tagName')\n    at addEL_hook (<anonymous>:675:29)\n    at top.addEventListener (<anonymous>:695:9)",
							},
						],
					},
				},
				{
					category: 'console',
					level: 'error',
					message:
						"React Router caught the following error during render TypeError: Cannot read properties of null (reading 'tagName')",
				},
			],
		}),
	).toBe(true)
	expect(
		isReactExtensionRenderLoopNoise({
			exception: {
				values: [{ type: 'Error', value: 'Should not already be working.' }],
			},
			breadcrumbs: {
				values: [
					{
						message:
							"React Router caught the following error during render TypeError: Cannot read properties of null (reading 'tagName')",
					},
				],
			},
		}),
	).toBe(true)
	// Real product render loops without extension breadcrumbs must still alert.
	expect(
		isReactExtensionRenderLoopNoise({
			exception: {
				values: [{ type: 'Error', value: 'Maximum update depth exceeded' }],
			},
		}),
	).toBe(false)
})

test('drops React Router opaque Unexpected Server Error client mirrors (aha)', () => {
	expect(
		isUnexpectedServerErrorNoise({
			exception: {
				values: [{ type: 'Error', value: 'Unexpected Server Error' }],
			},
		}),
	).toBe(true)
	expect(
		isUnexpectedServerErrorNoise({
			exception: {
				values: [
					{ type: 'Error', value: 'Unexpected Server Error with detail' },
				],
			},
		}),
	).toBe(false)
	expect(
		isUnexpectedServerErrorNoise({
			exception: {
				values: [{ type: 'TypeError', value: 'Unexpected Server Error' }],
			},
		}),
	).toBe(false)
})

test('drops Sentry Replay iframe/attachShadow prototype TypeErrors (aha)', () => {
	const replayIframeEvent = {
		exception: {
			values: [
				{
					type: 'TypeError',
					value: "Cannot read properties of undefined (reading 'prototype')",
					stacktrace: {
						frames: [
							{
								filename:
									'../../../../../node_modules/@sentry/browser/build/npm/esm/prod/helpers.js',
								function: 'r',
								inApp: false,
							},
							{
								filename:
									'../../../../../node_modules/@sentry-internal/replay/build/npm/esm/index.js',
								function: 'HTMLIFrameElement.<anonymous>',
								module: '@sentry-internal/replay/build/npm/esm/index',
								inApp: false,
							},
							{
								filename:
									'../../../../../node_modules/@sentry-internal/replay/build/npm/esm/index.js',
								function: 's.onIframeLoad',
								module: '@sentry-internal/replay/build/npm/esm/index',
								inApp: false,
							},
							{
								filename:
									'../../../../../node_modules/@sentry-internal/replay/build/npm/esm/index.js',
								function: 'TT.observeAttachShadow',
								module: '@sentry-internal/replay/build/npm/esm/index',
								inApp: false,
							},
							{
								filename:
									'../../../../../node_modules/@sentry-internal/replay/build/npm/esm/index.js',
								function: 'TT.patchAttachShadow',
								module: '@sentry-internal/replay/build/npm/esm/index',
								inApp: false,
							},
						],
					},
				},
			],
		},
	}

	expect(isSentryReplayIframeNoise(replayIframeEvent)).toBe(true)
	expect(isClientSentryNoise(replayIframeEvent)).toBe(true)

	// Same message without Replay iframe/shadow frames must still alert.
	expect(
		isSentryReplayIframeNoise({
			exception: {
				values: [
					{
						type: 'TypeError',
						value: "Cannot read properties of undefined (reading 'prototype')",
						stacktrace: {
							frames: [
								{
									filename: '/app/utils/something.ts',
									function: 'extendThing',
									inApp: true,
								},
							],
						},
					},
				],
			},
		}),
	).toBe(false)
	expect(
		isSentryReplayIframeNoise({
			exception: {
				values: [
					{
						type: 'TypeError',
						value: "Cannot read properties of undefined (reading 'prototype')",
					},
				],
			},
		}),
	).toBe(false)
})

test('isClientSentryNoise aggregates the client predicates', () => {
	expect(
		isClientSentryNoise({
			exception: {
				values: [{ type: 'AbortError', value: 'The operation was aborted.' }],
			},
		}),
	).toBe(true)
	expect(
		isClientSentryNoise({
			exception: {
				values: [{ type: 'Error', value: 'Unexpected Server Error' }],
			},
		}),
	).toBe(true)
	expect(
		isClientSentryNoise({
			exception: {
				values: [{ type: 'TypeError', value: 'Maximum update depth exceeded' }],
			},
		}),
	).toBe(false)
	expect(
		isClientSentryNoise({
			exception: {
				values: [{ type: 'Error', value: 'Should not already be working.' }],
			},
			breadcrumbs: [
				{
					message: 'at addEL_hook (<anonymous>:675:29)',
				},
			],
		}),
	).toBe(true)
})

test('drops learner-machine server environment noise (aha)', () => {
	expect(
		isServerEnvironmentNoise({
			exception: {
				values: [
					{ type: 'Error', value: 'ETIMEDOUT: connection timed out, read' },
				],
			},
		}),
	).toBe(true)
	expect(
		isServerEnvironmentNoise({
			exception: {
				values: [{ type: 'Error', value: 'spawn EBADF' }],
			},
		}),
	).toBe(true)
	expect(
		isServerEnvironmentNoise({
			exception: {
				values: [
					{
						type: 'TimeoutError',
						value:
							'Task timed out after 60000ms (queue has 1 running, 0 waiting)',
					},
				],
			},
		}),
	).toBe(true)
	expect(
		isServerEnvironmentNoise({
			exception: {
				values: [{ type: 'Error', value: 'Unexpected Server Error' }],
			},
		}),
	).toBe(false)
})
