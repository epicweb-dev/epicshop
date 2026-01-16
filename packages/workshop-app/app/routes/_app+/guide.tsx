import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'

export const handle: SEOHandle = {
	getSitemapEntries: () => [{ route: '/guide' }],
}

export default function Guide() {
	return (
		<div className="h-full w-full overflow-y-auto">
			<main className="container mt-12 flex w-full max-w-3xl grow flex-col gap-8 pb-24">
				<h1 className="text-h1 mb-4">Workshop App Guide</h1>

				<p className="text-lg">
					This guide will help you get the most out of the Epic Workshop App.
					Whether you're just getting started or need help troubleshooting,
					you'll find useful information here.
				</p>

				<div className="bg-accent rounded-lg p-6">
					<h2 className="text-h4 mb-2">🎓 New to the Workshop App?</h2>
					<p className="mb-4">
						We highly recommend going through the official tutorial to learn all
						the features the workshop app has to offer:
					</p>
					<code className="bg-background block rounded p-3 font-mono text-sm">
						npx epicshop add epicshop-tutorial
					</code>
					<p className="text-muted-foreground mt-2 text-sm">
						This will add the tutorial workshop to your setup so you can learn
						at your own pace.
					</p>
				</div>

				<section>
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

				<section>
					<h2 className="text-h3 mb-4">The Lesson Page</h2>
					<p className="mb-4">
						When you click into a lesson, the app displays the video along with
						written content, code snippets, and other useful information. To the
						right is a pane with tabs:
					</p>
					<ul className="list-disc space-y-2 pl-6">
						<li>
							<strong>Playground</strong> – Where you'll spend most of your
							time. You can interact with the app here or open it in a dedicated
							tab.
						</li>
						<li>
							<strong>Problem</strong> – The starting point of the exercise.
						</li>
						<li>
							<strong>Solution</strong> – The completed exercise state.
						</li>
						<li>
							<strong>Diff</strong> – Compare your current version against the
							finished state. Use this if you get stuck, but try to avoid it if
							possible.
						</li>
						<li>
							<strong>Tests</strong> – If the exercise includes tests, they'll
							appear here to verify your work.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-h3 mb-4">The Files List</h2>
					<p className="mb-4">
						At the bottom of a lesson page, the <strong>"Files"</strong> button
						opens a list of relevant files for the current exercise. Clicking a
						file opens it directly in your editor at the right location.
					</p>
					<p className="mb-4">Key things to know:</p>
					<ul className="list-disc space-y-2 pl-6">
						<li>
							Files are tied to your current Playground – make sure it's set to
							the lesson you're working on.
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
				</section>

				<section>
					<h2 className="text-h3 mb-4">Setting the Playground</h2>
					<p className="mb-4">
						If you navigate to a different exercise than what's currently
						loaded, a red <strong>"Set to Playground"</strong> link will appear.
						Clicking this syncs the playground for the appropriate exercise.
					</p>
					<p className="bg-warning text-warning-foreground rounded-lg p-4">
						<strong>Important:</strong> Always have your Playground set to the
						lesson you're working on! This is not automated because you might
						want to refer back to previous exercises without losing your current
						work.
					</p>
				</section>

				<section>
					<h2 className="text-h3 mb-4">Troubleshooting File Links</h2>
					<p className="mb-4">
						If you're unable to open file links from the workshop app, create a{' '}
						<code className="bg-muted rounded px-1">.env</code> file in the root
						of the workshop project and add:
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
						Note: If the path includes spaces, wrap it in quotes as shown in the
						Windows example.
					</p>
					<p className="mt-4">
						For Cursor/VS Code users, you can also install the 'code' command in your
						PATH by opening the Command Palette (⌘⇧P on Mac, Ctrl+Shift+P on
						Windows) and searching for "Install 'code' command in PATH".
					</p>
				</section>

				<section>
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
							<strong>💰 Marty the Money Bag</strong> – Gives specific tips and
							sometimes code
						</li>
						<li>
							<strong>📝 Nancy the Notepad</strong> – Encourages you to take
							notes
						</li>
						<li>
							<strong>🦉 Olivia the Owl</strong> – Gives useful tidbits and best
							practices
						</li>
						<li>
							<strong>📜 Dominic the Document</strong> – Links to useful
							documentation
						</li>
						<li>
							<strong>💣 Barry the Bomb</strong> – Indicates code to delete
						</li>
						<li>
							<strong>💪 Matthew the Muscle</strong> – Indicates you're working
							with an exercise
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

				<section>
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
		</div>
	)
}
