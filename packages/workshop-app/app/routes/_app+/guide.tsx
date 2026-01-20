import { type SEOHandle } from '@nasa-gcn/remix-seo'
import * as React from 'react'
import { Link } from 'react-router'

export const handle: SEOHandle = {
	getSitemapEntries: () => [{ route: '/guide' }],
}

const sections = [
	{ id: 'tutorial', label: 'Tutorial' },
	{ id: 'logging-in', label: 'Logging In' },
	{ id: 'interleaved-practice', label: 'Interleaved Practice' },
	{ id: 'workshop-structure', label: 'Workshop Structure' },
	{ id: 'lesson-page', label: 'The Lesson Page' },
	{ id: 'file-links', label: 'File Links' },
	{ id: 'setting-playground', label: 'Setting the Playground' },
	{ id: 'diff-tab', label: 'The Diff Tab' },
	{ id: 'tests', label: 'Tests' },
	{ id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts' },
	{ id: 'cli-commands', label: 'CLI Commands' },
	{ id: 'ai-assistant', label: 'AI Assistant (MCP)' },
	{ id: 'emoji-key', label: 'Emoji Key' },
	{ id: 'need-help', label: 'Need More Help?' },
] as const

function TableOfContents({ activeSection }: { activeSection: string | null }) {
	return (
		<nav className="sticky top-4 hidden lg:block">
			<h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
				On this page
			</h2>
			<ul className="space-y-2 text-sm">
				{sections.map((section) => (
					<li key={section.id}>
						<a
							href={`#${section.id}`}
							className={`block transition-colors ${
								activeSection === section.id
									? 'text-highlight font-medium'
									: 'text-muted-foreground hover:text-foreground'
							}`}
						>
							{section.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	)
}

export default function Guide() {
	const [activeSection, setActiveSection] = React.useState<string | null>(null)

	React.useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveSection(entry.target.id)
					}
				}
			},
			{
				rootMargin: '-20% 0px -60% 0px',
				threshold: 0,
			},
		)

		for (const section of sections) {
			const element = document.getElementById(section.id)
			if (element) {
				observer.observe(element)
			}
		}

		return () => observer.disconnect()
	}, [])

	return (
		<div className="h-full w-full overflow-y-auto">
			<div className="container mt-12 flex max-w-5xl gap-12 pb-24">
				<main className="flex w-full max-w-3xl grow flex-col gap-8">
					<h1 className="text-h1 mb-4">Workshop App Guide</h1>

					<p className="text-lg">
						This guide will help you get the most out of the Epic Workshop App.
						Whether you're just getting started or need help troubleshooting,
						you'll find useful information here.
					</p>

					<div id="tutorial" className="bg-accent scroll-mt-8 rounded-lg p-6">
						<h2 className="text-h4 mb-2">🎓 New to the Workshop App?</h2>
						<p className="mb-4">
							We highly recommend going through the official tutorial to learn
							all the features the workshop app has to offer:
						</p>
						<code className="bg-background block rounded p-3 font-mono text-sm">
							npx epicshop add epicshop-tutorial
						</code>
						<p className="text-muted-foreground mt-2 text-sm">
							This will add the tutorial workshop to your setup so you can learn
							at your own pace.
						</p>
					</div>

					<section id="logging-in" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Logging In</h2>
						<p className="mb-4">
							Logging in unlocks important features that enhance your learning
							experience:
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<strong>Progress tracking</strong> – Your progress syncs across
								devices and persists between sessions
							</li>
							<li>
								<strong>Video access</strong> – Watch premium workshop videos
								(requires a valid license)
							</li>
							<li>
								<strong>Discord integration</strong> – Connect with the
								community and instructors
							</li>
						</ul>

						<h3 className="text-h5 mt-6 mb-3">How to Log In</h3>
						<p className="mb-4">
							Click the <strong>Account</strong> link in the navigation (top
							right) and follow the login prompts. You can also log in via the
							CLI:
						</p>
						<code className="bg-muted mb-4 block rounded p-3 font-mono text-sm">
							epicshop auth login
						</code>
						<p className="mb-4">
							This opens a browser window where you can authenticate with your
							EpicWeb.dev, EpicReact.dev, or EpicAI.pro account.
						</p>
						<p className="text-muted-foreground text-sm">
							Tip: Log in early to start tracking your progress from the
							beginning!
						</p>
					</section>

					<section id="interleaved-practice" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Interleaved Practice</h2>
						<p className="mb-4">
							Interleaved practice mixes previously learned material with new
							content so your brain has to recall concepts instead of relying on
							short-term memory. This spacing effect improves long-term
							retention and makes it easier to apply skills in new contexts.
						</p>
						<p className="mb-4">
							Once you're logged in and have completed at least two exercise
							steps, you'll see a <strong>Practice a past lesson</strong> button
							next to <strong>Continue to next lesson</strong> in the
							navigation. Click it any time to jump to a random completed step
							and refresh what you've learned.
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>You must be logged in.</li>
							<li>You need two or more completed steps.</li>
						</ul>
					</section>

					<section id="workshop-structure" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Workshop Structure</h2>
						<p className="mb-4">
							Each workshop is a standalone project with a consistent structure:
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<strong>exercises/</strong> – Contains the "problem" and
								"solution" versions of each step. Treat this as a reference for
								after the workshop.
							</li>
							<li>
								<strong>playground/</strong> – This is where your work takes
								place. We recommend opening this directory as its own editor
								instance for efficient file searching.
							</li>
						</ul>
					</section>

					<section id="lesson-page" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">The Lesson Page</h2>
						<p className="mb-4">
							When you click into a lesson, the app displays the video along
							with written content, code snippets, and other useful information.
							To the right is a pane with tabs:
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<strong>Playground</strong> – Where you'll spend most of your
								time. You can interact with the app here or open it in a
								dedicated tab.
							</li>
							<li>
								<strong>Problem</strong> – The starting point of the exercise.
							</li>
							<li>
								<strong>Solution</strong> – The completed exercise state.
							</li>
							<li>
								<strong>Diff</strong> – Compare your current version against the
								finished state. Use this if you get stuck, but try to avoid it
								if possible.
							</li>
							<li>
								<strong>Tests</strong> – If the exercise includes tests, they'll
								appear here to verify your work.
							</li>
						</ul>
					</section>

					<section id="file-links" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">File Links</h2>
						<p className="mb-4">
							At the bottom of a lesson page, the <strong>"Files"</strong>{' '}
							button opens a list of relevant files for the current exercise.
							Clicking a file opens it directly in your editor at the right
							location.
						</p>
						<p className="mb-4">Key things to know:</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								Files are tied to your current Playground – make sure it's set
								to the lesson you're working on.
							</li>
							<li>
								A <strong>"+"</strong> icon next to a filename means you need to
								create that file. Clicking it will create and open the file.
							</li>
							<li>
								If you see a red "Set to Playground" link, click it to sync the
								playground for the current exercise.
							</li>
						</ul>

						<h3
							id="file-links-troubleshooting"
							className="text-h4 mt-8 mb-4 scroll-mt-8"
						>
							Troubleshooting
						</h3>
						<p className="mb-4">
							If you're unable to open file links from the workshop app, create
							a <code className="bg-muted rounded px-1">.env</code> file in the
							root of the workshop project and add:
						</p>
						<code className="bg-muted mb-4 block rounded p-3 font-mono text-sm">
							EPICSHOP_EDITOR="path/to/your/editor"
						</code>
						<p className="mb-4">Examples:</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<strong>VS Code:</strong>{' '}
								<code className="bg-muted rounded px-1">
									EPICSHOP_EDITOR=code
								</code>
							</li>
							<li>
								<strong>VS Code on Windows:</strong>{' '}
								<code className="bg-muted rounded px-1">
									EPICSHOP_EDITOR='"C:\Program Files\Microsoft VS
									Code\bin\code.cmd"'
								</code>
							</li>
							<li>
								<strong>Cursor:</strong>{' '}
								<code className="bg-muted rounded px-1">
									EPICSHOP_EDITOR=cursor
								</code>
							</li>
						</ul>
						<p className="text-muted-foreground mt-4 text-sm">
							Note: If the path includes spaces, wrap it in quotes as shown in
							the Windows example.
						</p>
						<p className="mt-4">
							For Cursor/VS Code users, you can also install the 'code' command
							in your PATH by opening the Command Palette (⌘⇧P on Mac,
							Ctrl+Shift+P on Windows) and searching for "Install 'code' command
							in PATH".
						</p>
					</section>

					<section id="setting-playground" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Setting the Playground</h2>
						<p className="mb-4">
							If you navigate to a different exercise than what's currently
							loaded, a red <strong>"Set to Playground"</strong> link will
							appear. Clicking this syncs the playground for the appropriate
							exercise.
						</p>
						<p className="bg-warning text-warning-foreground rounded-lg p-4">
							<strong>Important:</strong> Always have your Playground set to the
							lesson you're working on! This is not automated because you might
							want to refer back to previous exercises without losing your
							current work.
						</p>
					</section>

					<section id="diff-tab" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">The Diff Tab</h2>
						<p className="mb-4">
							The diff tab helps you get unstuck when you're totally stuck. It
							shows the difference between your playground and the solution.
							This is especially useful for catching typos or small mistakes.
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<span className="text-success font-mono">+</span> lines (green)
								show code that needs to be added
							</li>
							<li>
								<span className="text-foreground-destructive font-mono">-</span>{' '}
								lines (red) show code that needs to be removed
							</li>
							<li>Unchanged lines provide context around the changes</li>
						</ul>
						<p className="text-muted-foreground mt-4 text-sm">
							Tip: Try to avoid using the diff tab until you've made a solid
							attempt at the exercise. The learning happens in the struggle!
						</p>
					</section>

					<section id="tests" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Tests</h2>
						<p className="mb-4">
							Some exercises include tests to verify your work. If available,
							they appear in the Tests tab. Tests can run in two ways:
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<strong>Script-based:</strong> A button runs the test script and
								streams the output
							</li>
							<li>
								<strong>Browser-based:</strong> Test files are compiled and run
								directly in the browser
							</li>
						</ul>
						<p className="mt-4">
							Look for 🚨 <strong>Alfred the Alert</strong> in test failures for
							helpful explanations about what went wrong.
						</p>
					</section>

					<section id="keyboard-shortcuts" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Keyboard Shortcuts</h2>
						<p className="mb-4">
							When the workshop server is running in your terminal, you can use
							these keyboard shortcuts:
						</p>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<kbd className="bg-muted rounded px-2 py-1 font-mono text-sm">
									u
								</kbd>{' '}
								– Check for and apply updates to the workshop
							</li>
							<li>
								<kbd className="bg-muted rounded px-2 py-1 font-mono text-sm">
									d
								</kbd>{' '}
								– Dismiss update notifications
							</li>
						</ul>
						<p className="text-muted-foreground mt-4 text-sm">
							The server automatically restarts after updates are applied.
						</p>
					</section>

					<section id="cli-commands" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">CLI Commands</h2>
						<p className="mb-4">
							The <code className="bg-muted rounded px-1">epicshop</code> CLI
							provides useful commands for managing your workshop:
						</p>
						<div className="space-y-4">
							<div>
								<code className="bg-muted block rounded p-3 font-mono text-sm">
									epicshop start
								</code>
								<p className="text-muted-foreground mt-1 text-sm">
									Start the workshop (or just run{' '}
									<code className="bg-muted rounded px-1">npm start</code>)
								</p>
							</div>
							<div>
								<code className="bg-muted block rounded p-3 font-mono text-sm">
									epicshop playground set
								</code>
								<p className="text-muted-foreground mt-1 text-sm">
									Set the playground to the next incomplete step
								</p>
							</div>
							<div>
								<code className="bg-muted block rounded p-3 font-mono text-sm">
									epicshop diff
								</code>
								<p className="text-muted-foreground mt-1 text-sm">
									Show the diff between your playground and the solution in the
									terminal
								</p>
							</div>
							<div>
								<code className="bg-muted block rounded p-3 font-mono text-sm">
									epicshop progress
								</code>
								<p className="text-muted-foreground mt-1 text-sm">
									View your progress through the workshop
								</p>
							</div>
							<div>
								<code className="bg-muted block rounded p-3 font-mono text-sm">
									epicshop exercises
								</code>
								<p className="text-muted-foreground mt-1 text-sm">
									List all exercises with completion status
								</p>
							</div>
						</div>
						<p className="mt-4">
							Run <code className="bg-muted rounded px-1">epicshop --help</code>{' '}
							to see all available commands.
						</p>
					</section>

					<section id="ai-assistant" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">AI Assistant (MCP)</h2>
						<p className="mb-4">
							If you use an AI assistant that supports{' '}
							<a
								href="https://modelcontextprotocol.io/"
								target="_blank"
								rel="noopener noreferrer"
								className="underline"
							>
								MCP (Model Context Protocol)
							</a>
							, you can install the Epic Workshop MCP server to enhance your
							learning experience.
						</p>

						<h3 className="text-h5 mt-6 mb-3">What it provides</h3>
						<ul className="list-disc space-y-2 pl-6">
							<li>
								<strong>Exercise context:</strong> Your AI can understand what
								you're working on and provide relevant help
							</li>
							<li>
								<strong>Progress tracking:</strong> Mark lessons complete
								directly through your AI
							</li>
							<li>
								<strong>Diff viewing:</strong> Ask your AI to show you what
								changes are needed
							</li>
							<li>
								<strong>File opening:</strong> Have your AI open the relevant
								files in your editor
							</li>
							<li>
								<strong>Quiz mode:</strong> Ask your AI to quiz you on workshop
								topics
							</li>
						</ul>

						<h3 className="text-h5 mt-6 mb-3">Installation</h3>
						<p className="mb-4">
							Add the following to your AI assistant's MCP configuration (e.g.,
							Claude Desktop):
						</p>
						<pre className="bg-muted overflow-x-auto rounded p-4 font-mono text-sm">
							{`{
  "mcpServers": {
    "epicshop": {
      "command": "npx",
      "args": ["-y", "@epic-web/workshop-mcp"]
    }
  }
}`}
						</pre>
						<p className="text-muted-foreground mt-4 text-sm">
							Make sure to run your AI assistant from within the workshop
							directory so the MCP server can find the right files.
						</p>
					</section>

					<section id="emoji-key" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Emoji Key</h2>
						<p className="mb-4">
							Each exercise has comments with helpful emoji characters:
						</p>
						<ul className="space-y-2 pl-6">
							<li>
								<strong>👨‍💼 Peter the Product Manager</strong> – Helps you know
								what users want
							</li>
							<li>
								<strong>🧝‍♀️ Kellie the Co-worker</strong> – Your co-worker who
								sometimes does work ahead of your exercises
							</li>
							<li>
								<strong>🐨 Kody the Koala</strong> – Tells you when there's
								something specific to do
							</li>
							<li>
								<strong>🦺 Lily the Life Jacket</strong> – Helps with
								TypeScript-specific parts
							</li>
							<li>
								<strong>💰 Marty the Money Bag</strong> – Gives specific tips
								and sometimes code
							</li>
							<li>
								<strong>📝 Nancy the Notepad</strong> – Encourages you to take
								notes
							</li>
							<li>
								<strong>🦉 Olivia the Owl</strong> – Gives useful tidbits and
								best practices
							</li>
							<li>
								<strong>📜 Dominic the Document</strong> – Links to useful
								documentation
							</li>
							<li>
								<strong>💣 Barry the Bomb</strong> – Indicates code to delete
							</li>
							<li>
								<strong>💪 Matthew the Muscle</strong> – Indicates you're
								working with an exercise
							</li>
							<li>
								<strong>🏁 Chuck the Checkered Flag</strong> – Indicates a final
								step
							</li>
							<li>
								<strong>🚨 Alfred the Alert</strong> – Shows up in test failures
								with explanations
							</li>
						</ul>
					</section>

					<section id="need-help" className="scroll-mt-8">
						<h2 className="text-h3 mb-4">Need More Help?</h2>
						<p>
							Visit our{' '}
							<Link to="/support" className="underline">
								Support page
							</Link>{' '}
							for additional help options, including Discord access and how to
							report issues.
						</p>
					</section>
				</main>
				<aside className="hidden w-48 shrink-0 lg:block">
					<TableOfContents activeSection={activeSection} />
				</aside>
			</div>
		</div>
	)
}
