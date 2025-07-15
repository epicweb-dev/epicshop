import { createId } from '@paralleldrive/cuid2'

// Header name for request correlation
export const CORRELATION_ID_HEADER = 'x-correlation-id'

// Generate a unique correlation ID
export function generateCorrelationId(): string {
	return createId()
}

// Store correlation ID in context (client-side)
let currentCorrelationId: string | null = null

export function setCorrelationId(id: string): void {
	currentCorrelationId = id
}

export function getCorrelationId(): string | null {
	return currentCorrelationId
}

export function clearCorrelationId(): void {
	currentCorrelationId = null
}

// Context for storing correlation ID during request processing (server-side)
export const requestCorrelationContext = new Map<string, string>()

export function setRequestCorrelationId(requestId: string, correlationId: string): void {
	requestCorrelationContext.set(requestId, correlationId)
}

export function getRequestCorrelationId(requestId: string): string | null {
	return requestCorrelationContext.get(requestId) || null
}

export function clearRequestCorrelationId(requestId: string): void {
	requestCorrelationContext.delete(requestId)
}