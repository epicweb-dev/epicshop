import React from 'react'
import { LaunchEditor } from '~/routes/launch-editor.tsx'

export function EditReadme({
	name,
	stepPath,
}: {
	name: string
	stepPath: string
}) {
	const [altDown, setAltDown] = React.useState(false)

	React.useEffect(() => {
		if (ENV.KCDSHOP_DEPLOYED) return
		const set = (e: KeyboardEvent) => setAltDown(e.altKey)
		document.addEventListener('keydown', set)
		document.addEventListener('keyup', set)
		return () => {
			document.removeEventListener('keyup', set)
			document.removeEventListener('keydown', set)
		}
	}, [])

	// prevent Alt+click from trying to save the file when KCDSHOP_DEPLOYED is true
	// by using button instead of <a> tag or <Link>
	const handleClick = () => {
		const githubPath = ENV.KCDSHOP_GITHUB_ROOT.replace(/tree|blob/, 'edit')
		const editPath = `${githubPath}/${stepPath}/README.mdx`.replace(/\\/g, '/')
		const newWindow = window.open(editPath, '_blank', 'noopener,noreferrer')
		if (newWindow) newWindow.opener = null
	}

	return altDown ? (
		<div className="self-center text-sm font-mono">
			<LaunchEditor appFile="README.mdx" appName={name}>
				Edit this page on GitHub
			</LaunchEditor>
		</div>
	) : (
		<button className="self-center text-sm font-mono" onClick={handleClick}>
			Edit this page on GitHub
		</button>
	)
}
