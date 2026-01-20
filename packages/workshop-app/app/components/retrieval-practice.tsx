import { toast as showToast } from 'sonner'
import { Icon } from '#app/components/icons.tsx'

export function RetrievalPractice({
	exerciseNumber,
}: {
	exerciseNumber?: number
}) {
	const prompt = exerciseNumber
		? `Please quiz me on exercise ${exerciseNumber} using the epicshop MCP server. Call the get_quiz_instructions tool with exerciseNumber "${exerciseNumber}" to get the quiz instructions, then quiz me one question at a time.`
		: `Please quiz me on this workshop using the epicshop MCP server. Call the get_quiz_instructions tool to get the quiz instructions, then quiz me one question at a time.`

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(prompt)
			showToast.success('Copied prompt to clipboard')
		} catch (error) {
			console.error('Failed to copy to clipboard:', error)
			showToast.error('Failed to copy to clipboard')
		}
	}

	return (
		<div className="border-t border-border pt-6 mt-6">
			<h2 className="text-foreground text-xl font-semibold mb-3">
				Test Your Knowledge
			</h2>
			<p className="text-muted-foreground mb-4">
				Retrieval practice helps solidify learning by actively recalling
				information. Use this prompt with your AI assistant to quiz yourself on
				what you've learned.
			</p>
			<div className="bg-background border border-border rounded-lg p-4 mb-4 relative">
				<pre className="text-foreground text-sm whitespace-pre-wrap break-words pr-10">
					{prompt}
				</pre>
				<button
					onClick={handleCopy}
					className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
					aria-label="Copy prompt to clipboard"
				>
					<Icon name="Copy" size="sm" />
				</button>
			</div>
			<p className="text-muted-foreground text-sm">
				<a
					href="https://www.epicai.pro/your-ai-assistant-instructor-the-epicshop-mcp-server-0eazr"
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground hover:underline inline-flex items-center gap-1.5"
				>
					Learn how to set up the epicshop MCP server
					<Icon name="ExternalLink" size="sm" />
				</a>
			</p>
		</div>
	)
}
