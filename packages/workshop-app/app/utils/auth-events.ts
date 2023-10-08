export const EVENTS = {
	USER_CODE_RECEIVED: 'USER_CODE_RECEIVED',
	AUTH_RESOLVED: 'AUTH_RESOLVED',
	AUTH_REJECTED: 'AUTH_REJECTED',
} as const
export type EventTypes = keyof typeof EVENTS
