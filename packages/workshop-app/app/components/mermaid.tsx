import { useEffect, useRef } from 'react'

export function Mermaid({
	code,
	onSvg,
}: {
	code: string
	onSvg?: (svg: string) => void
}) {
	const ref = useRef<HTMLDivElement>(null)
	const latestOnSvg = useRef(onSvg)
	useEffect(() => {
		latestOnSvg.current = onSvg
	}, [onSvg])

	useEffect(() => {
		if (!ref.current) return
		let cancelled = false
		void import('mermaid').then((mermaid) => {
			mermaid.default.initialize({ startOnLoad: false })
			mermaid.default
				.render('mermaid-svg', code)
				.then(({ svg }) => {
					if (!cancelled && ref.current) {
						ref.current.innerHTML = svg
						latestOnSvg.current?.(svg)
					}
				})
				.catch((err) => {
					if (!cancelled && ref.current) {
						ref.current.innerHTML = `<pre style='color:red'>${String(err)}</pre>`
					}
				})
		})
		return () => {
			cancelled = true
		}
	}, [code])
	return <div ref={ref} />
}
