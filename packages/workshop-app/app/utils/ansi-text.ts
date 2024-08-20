import AnsiToHTML from 'ansi-to-html'
import { useMemo } from 'react'
import { useTheme } from '#app/routes/theme/index.js'

export function useAnsiToHtml() {
	const theme = useTheme()
	const ansi = useMemo(
		() =>
			new AnsiToHTML(
				theme === 'dark'
					? { fg: '#d6deeb', bg: '#121318', escapeXML: true }
					: { fg: '#000000', bg: '#f3f3f3', escapeXML: true },
			),
		[theme],
	)
	return ansi
}
