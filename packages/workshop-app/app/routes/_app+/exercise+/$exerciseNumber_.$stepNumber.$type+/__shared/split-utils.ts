export const splitCookieName = 'es_split_pct'

export function computeSplitPercent(input: unknown, defaultValue = 50): number {
	const value = typeof input === 'number' ? input : Number(input)
	if (Number.isFinite(value)) {
		return Math.min(80, Math.max(20, Math.round(value * 100) / 100))
	}
	return defaultValue
}
