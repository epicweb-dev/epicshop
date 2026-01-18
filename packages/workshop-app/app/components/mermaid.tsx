import { useEffect, useId, useRef } from 'react'
import { useTheme } from '#app/routes/theme/index.tsx'

type MermaidTheme = 'dark' | 'default'

export function Mermaid({
	code,
	svg,
	svgTheme,
	onSvg,
}: {
	code: string
	svg?: string
	svgTheme?: MermaidTheme
	onSvg?: (svg: string) => void
}) {
	const theme = useTheme()
	const mermaidTheme: MermaidTheme = theme === 'dark' ? 'dark' : 'default'
	const id = `mermaid-svg-${useId()}`
	const renderId = `${id}-${mermaidTheme}`
	const ref = useRef<HTMLDivElement>(null)
	const latestOnSvg = useRef(onSvg)
	useEffect(() => {
		latestOnSvg.current = onSvg
	}, [onSvg])

	useEffect(() => {
		if (!ref.current) return
		if (svg && svgTheme === mermaidTheme) return
		let cancelled = false
		void import('mermaid').then((mermaid) => {
			mermaid.default.initialize({ startOnLoad: false, theme: mermaidTheme })
			mermaid.default
				.render(renderId, code)
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
	}, [code, mermaidTheme, renderId, svg, svgTheme])
	return (
		<div className="mermaid not-prose">
			<div
				ref={ref}
				dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
			/>
		</div>
	)
}
