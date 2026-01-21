export function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes)) return '—'
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	if (kb < 1024) return `${kb.toFixed(1)} KB`
	const mb = kb / 1024
	if (mb < 1024) return `${mb.toFixed(1)} MB`
	return `${(mb / 1024).toFixed(1)} GB`
}
