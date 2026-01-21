import * as React from 'react'
import { Icon } from '#app/components/icons.tsx'

export function RetrievalPractice({
	exerciseNumber,
}: {
	exerciseNumber?: number
}) {
	const [copied, setCopied] = React.useState(false)

	const prompt = exerciseNumber
		? `Please quiz me on exercise ${exerciseNumber} using the epicshop MCP server. Call the get_quiz_instructions tool with exerciseNumber "${exerciseNumber}" to get the quiz instructions, then quiz me one question at a time.`
		: `Please quiz me on this workshop using the epicshop MCP server. Call the get_quiz_instructions tool to get the quiz instructions, then quiz me one question at a time.`

	React.useEffect(() => {
		if (copied) {
			const timeoutId = setTimeout(() => setCopied(false), 1000)
			return () => clearTimeout(timeoutId)
		}
	}, [copied])

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(prompt)
			setCopied(true)
		} catch (error) {
			console.error('Failed to copy to clipboard:', error)
		}
	}

	return (
		<div className="border-border mt-6 border-t pt-6">
			<h2 className="text-foreground mb-3 text-xl font-semibold">
				Test Your Knowledge
			</h2>
			<p className="text-muted-foreground mb-4">
				Retrieval practice helps solidify learning by actively recalling
				information. Use this prompt with your AI assistant to quiz yourself on
				what you've learned.
			</p>
			<div className="bg-background border-border relative mb-4 rounded-lg border p-4">
				<pre className="text-foreground pr-10 text-sm break-words whitespace-pre-wrap">
					{prompt}
				</pre>
				<button
					onClick={handleCopy}
					className="text-muted-foreground hover:text-foreground absolute top-4 right-4 transition-colors"
					aria-label={copied ? 'Copied!' : 'Copy prompt to clipboard'}
				>
					<Icon name={copied ? 'CheckSmall' : 'Copy'} size="sm" />
				</button>
			</div>
			<p className="text-muted-foreground text-sm">
				<a
					href="https://www.epicai.pro/your-ai-assistant-instructor-the-epicshop-mcp-server-0eazr"
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground inline-flex items-center gap-1.5 hover:underline"
				>
					Learn how to set up the epicshop MCP server
					<Icon name="ExternalLink" size="sm" />
				</a>
			</p>
		</div>
	)
}
