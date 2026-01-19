export type ToolAnnotationHints = {
	readOnlyHint: boolean
	destructiveHint: boolean
	idempotentHint: boolean
	openWorldHint: boolean
}

type ToolInputDoc = {
	name: string
	type: string
	required: boolean
	description: string
	examples?: Array<string>
}

type ToolExampleDoc = {
	description: string
	params: string
}

export type ToolDoc = {
	title: string
	summary: string
	inputs: Array<ToolInputDoc>
	returns: string
	examples: Array<ToolExampleDoc>
	nextSteps: Array<string>
	errorNextSteps?: Array<string>
	annotations: ToolAnnotationHints
}

type PromptDoc = {
	title: string
	description: string
	examples: Array<string>
	nextSteps: Array<string>
}

type ResourceDoc = {
	name: string
	description: string
}

export const serverInstructions = `
Quick start
- Call \`get_what_is_next\` first to discover the next required action.
- If the user is not logged in, call \`login\` and wait for the verification flow.
- Use \`set_playground\` to move to a step, then \`open_exercise_step_files\` to open relevant files.

Default behavior
- Use \`list_saved_playgrounds\` and \`set_saved_playground\` to restore saved copies when persistence is enabled.
- \`workshopDirectory\` is required and must be an absolute path to the workshop root.
- Passing a \`/playground\` path is normalized to the workshop root.
- The user's work-in-progress lives in the \`playground\` directory.
- \`get_exercise_context\` defaults to the current playground exercise when \`exerciseNumber\` is omitted.
- \`set_playground\` uses the next incomplete step when arguments are omitted.

How to chain tools safely
- Use \`get_workshop_context\` to learn exercise numbers and topics.
- Use \`get_exercise_context\` or \`get_exercise_step_context\` for instructions and IDs.
- Use \`update_progress\` with \`epicLessonSlug\` from context tools.
- Re-run \`get_what_is_next\` after progress updates or when unsure.

Common patterns & examples
- "Help me continue" -> \`get_what_is_next\` -> follow steps -> \`update_progress\` -> \`get_what_is_next\`.
- "Show step 2.3 solution" -> \`set_playground\` { exerciseNumber: 2, stepNumber: 3, type: "solution" } -> \`open_exercise_step_files\`.
- "Diff between 02.03 problem and solution" -> \`get_diff_between_apps\` { app1: "02.03.problem", app2: "02.03.solution" }.
`.trim()

export const toolDocs = {
	login: {
		title: 'Login',
		summary:
			'Start device authorization and store credentials after the user verifies.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description:
					'Absolute path to the workshop root. Passing a /playground path is allowed and normalized.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ verificationUrl, userCode, expiresInSeconds }',
		examples: [
			{
				description: 'Start login for a workshop',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Ask the user to open the verification URL and enter the code.',
			'Call `get_user_info` to confirm authentication.',
		],
		errorNextSteps: [
			'Verify the workshop path points to a valid workshop root.',
		],
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
	},
	logout: {
		title: 'Logout',
		summary:
			'Log the user out of the workshop host and clear cached credentials.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ loggedOut: true }',
		examples: [
			{
				description: 'Logout from the current workshop',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: ['Call `login` if the user wants to re-authenticate.'],
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	set_playground: {
		title: 'Set Playground',
		summary:
			'Set the playground to a specific exercise step or the next incomplete step.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'exerciseNumber',
				type: 'number',
				required: false,
				description:
					'Exercise number to open. Omit to continue to the next incomplete step.',
				examples: ['1', '5'],
			},
			{
				name: 'stepNumber',
				type: 'number',
				required: false,
				description:
					'Step number within the exercise. Omit to use the current step or next step.',
				examples: ['1', '3'],
			},
			{
				name: 'type',
				type: '"problem" | "solution"',
				required: false,
				description:
					'Step type. Omit to keep the current type or default to the problem step.',
				examples: ['problem', 'solution'],
			},
		],
		returns:
			'{ playground: { exerciseNumber, stepNumber, type, appName, fullPath } }',
		examples: [
			{
				description: 'Continue to the next incomplete step',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
			{
				description: 'Open exercise 2 step 3 solution',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "exerciseNumber": 2, "stepNumber": 3, "type": "solution" }',
			},
		],
		nextSteps: [
			'Call `open_exercise_step_files` to open the relevant files.',
			'Use `get_exercise_step_progress_diff` to review remaining changes.',
		],
		errorNextSteps: [
			'Verify exercise and step numbers exist in `get_workshop_context`.',
		],
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	list_saved_playgrounds: {
		title: 'List Saved Playgrounds',
		summary:
			'List saved playground copies when playground persistence is enabled.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns:
			'{ savedPlaygrounds: [{ id, appName, displayName, createdAt, createdAtMs, fullPath }] }',
		examples: [
			{
				description: 'List saved playgrounds',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Call `set_saved_playground` with a savedPlaygroundId to restore a copy.',
		],
		errorNextSteps: [
			'Enable playground persistence in Preferences and set the playground at least once.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	set_saved_playground: {
		title: 'Set Saved Playground',
		summary: 'Restore the playground from a saved copy.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'savedPlaygroundId',
				type: 'string',
				required: false,
				description:
					'Saved playground id (directory name). Omit to restore the most recent saved copy.',
				examples: ['2026.01.18_11.12.00_01.01.problem'],
			},
			{
				name: 'latest',
				type: 'boolean',
				required: false,
				description: 'Use the most recent saved playground when true.',
				examples: ['true'],
			},
		],
		returns:
			'{ savedPlayground: { id, appName, displayName, createdAt, fullPath } }',
		examples: [
			{
				description: 'Restore the most recent saved playground',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
			{
				description: 'Restore a specific saved playground',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "savedPlaygroundId": "2026.01.18_11.12.00_01.01.problem" }',
			},
		],
		nextSteps: [
			'Open relevant files with `open_exercise_step_files` or `open_file`.',
		],
		errorNextSteps: [
			'Call `list_saved_playgrounds` to get valid savedPlaygroundId values.',
		],
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	update_progress: {
		title: 'Update Progress',
		summary:
			'Mark an Epic lesson as complete or incomplete for the current user.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'epicLessonSlug',
				type: 'string',
				required: true,
				description:
					'Lesson slug from `get_exercise_context`, `get_workshop_context`, or `get_what_is_next`.',
				examples: ['react-basics-01-intro'],
			},
			{
				name: 'complete',
				type: 'boolean',
				required: false,
				description: 'Whether to mark complete (default: true).',
				examples: ['true', 'false'],
			},
		],
		returns: '{ epicLessonSlug, complete }',
		examples: [
			{
				description: 'Mark a lesson complete',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "epicLessonSlug": "react-basics-01-intro", "complete": true }',
			},
		],
		nextSteps: [
			'Call `get_what_is_next` to get the next action.',
			'Use `get_user_progress` to verify updates.',
		],
		errorNextSteps: ['Confirm the slug matches one from the context tools.'],
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
	},
	get_workshop_context: {
		title: 'Get Workshop Context',
		summary:
			'Return a high-level view of the workshop, including exercises and progress.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ meta, exercises[] }',
		examples: [
			{
				description: 'Fetch workshop context',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Use `get_exercise_context` for a specific exercise.',
			'Use `get_what_is_next` to find the next action.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	get_exercise_context: {
		title: 'Get Exercise Context',
		summary:
			'Return instructions, transcripts, and progress for a single exercise.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'exerciseNumber',
				type: 'number',
				required: false,
				description:
					'Exercise number to fetch. Omit to use the current playground exercise.',
				examples: ['1', '4'],
			},
		],
		returns: '{ exerciseInfo, steps[], currentContext }',
		examples: [
			{
				description: 'Fetch context for exercise 3',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "exerciseNumber": 3 }',
			},
		],
		nextSteps: [
			'Use `get_exercise_step_context` for a specific step.',
			'Use `get_exercise_step_progress_diff` to compare progress.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	get_diff_between_apps: {
		title: 'Get Diff Between Apps',
		summary:
			'Return a git diff between two exercise apps by ID (problem vs solution).',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'app1',
				type: 'string',
				required: true,
				description: 'First app ID, e.g. "02.03.problem" or "02.03.solution".',
				examples: ['02.03.problem'],
			},
			{
				name: 'app2',
				type: 'string',
				required: true,
				description: 'Second app ID, e.g. "02.03.solution" or "02.03.problem".',
				examples: ['02.03.solution'],
			},
		],
		returns: '{ diff }',
		examples: [
			{
				description: 'Compare problem and solution for step 2.3',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "app1": "02.03.problem", "app2": "02.03.solution" }',
			},
		],
		nextSteps: [
			'Use `set_playground` to open the relevant step.',
			'Use `open_exercise_step_files` to review changed files.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	get_exercise_step_progress_diff: {
		title: 'Get Exercise Step Progress Diff',
		summary:
			'Return a diff between the playground and the current step solution.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ diff }',
		examples: [
			{
				description: 'Check current step progress',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Use `open_exercise_step_files` to edit missing changes.',
			'Re-run this tool to verify progress.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	get_exercise_step_context: {
		title: 'Get Exercise Step Context',
		summary:
			'Return instructions, transcripts, and progress for a single step.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'exerciseNumber',
				type: 'number',
				required: true,
				description: 'Exercise number (1-based).',
				examples: ['2'],
			},
			{
				name: 'stepNumber',
				type: 'number',
				required: true,
				description: 'Step number within the exercise (1-based).',
				examples: ['3'],
			},
		],
		returns: '{ stepInfo, problem, solution, currentContext }',
		examples: [
			{
				description: 'Fetch context for exercise 2 step 3',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "exerciseNumber": 2, "stepNumber": 3 }',
			},
		],
		nextSteps: [
			'Use `set_playground` to open the step.',
			'Use `get_exercise_step_progress_diff` to compare progress.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	view_video: {
		title: 'View Video',
		summary:
			'Open an Epic lesson video in the embedded UI player for the user.',
		inputs: [
			{
				name: 'videoUrl',
				type: 'string',
				required: true,
				description:
					'Video URL from exercise context or from `get_what_is_next` results.',
				examples: ['https://epicweb.dev/workshops/react/01-intro'],
			},
		],
		returns: '{ iframeUrl, videoUrl }',
		examples: [
			{
				description: 'Show the intro video',
				params: '{ "videoUrl": "https://epicweb.dev/workshops/react/intro" }',
			},
		],
		nextSteps: ['Use `update_progress` when the user finishes the video.'],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	open_exercise_step_files: {
		title: 'Open Exercise Step Files',
		summary:
			'Open the files that differ between the current playground and solution.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ files: Array<{ path, line }> }',
		examples: [
			{
				description: 'Open files for the current step',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Edit the opened files in the editor.',
			'Run tests or the dev server to verify progress.',
		],
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
	},
	get_user_info: {
		title: 'Get User Info',
		summary:
			'Return the current authenticated user details (or null if logged out).',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ id, email, name } | null',
		examples: [
			{
				description: 'Check authentication status',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: ['Call `login` if the user is not authenticated.'],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	get_user_access: {
		title: 'Get User Access',
		summary: 'Check whether the user has paid access to workshop features.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ userHasAccess }',
		examples: [
			{
				description: 'Check paid access status',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: ['Encourage upgrade if access is required.'],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	get_user_progress: {
		title: 'Get User Progress',
		summary:
			'Return the full progress list for the current user across the workshop.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ progress[] }',
		examples: [
			{
				description: 'Fetch progress list',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Use `update_progress` to mark lessons complete.',
			'Use `get_what_is_next` to focus on the next item.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
	},
	get_quiz_instructions: {
		title: 'Get Quiz Instructions',
		summary:
			'Return a prompt that guides the assistant to quiz the user on a topic.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
			{
				name: 'exerciseNumber',
				type: 'string',
				required: false,
				description: 'Exercise number to quiz. Omit for a random exercise.',
				examples: ['4'],
			},
		],
		returns: '{ messages[] }',
		examples: [
			{
				description: 'Quiz the user on exercise 4',
				params:
					'{ "workshopDirectory": "/Users/alice/workshops/react", "exerciseNumber": "4" }',
			},
		],
		nextSteps: ['Follow the prompt and ask questions one at a time.'],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	},
	get_what_is_next: {
		title: 'Get What Is Next',
		summary: 'Determine the next action a user should take in the workshop.',
		inputs: [
			{
				name: 'workshopDirectory',
				type: 'string',
				required: true,
				description: 'Absolute path to the workshop root.',
				examples: ['/Users/alice/workshops/react-fundamentals'],
			},
		],
		returns: '{ nextStep, context }',
		examples: [
			{
				description: 'Find the next step for a user',
				params: '{ "workshopDirectory": "/Users/alice/workshops/react" }',
			},
		],
		nextSteps: [
			'Follow the instructions returned in the response.',
			'Call `update_progress` when the user completes the step.',
		],
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
	},
} satisfies Record<string, ToolDoc>

export const promptDocs = {
	quiz_me: {
		title: 'Quiz Me',
		description:
			'Guide the assistant to quiz the user on a workshop exercise using context.',
		examples: ['Quiz me on exercise 4', 'Quiz me on a random exercise'],
		nextSteps: [
			'Ask one question at a time and give hints if the user struggles.',
		],
	},
} satisfies Record<string, PromptDoc>

export const resourceDocs = {
	workshop_context: {
		name: 'workshop_context',
		description:
			'Workshop overview with README, config, exercises, and progress.',
	},
	exercise_context: {
		name: 'exercise_context',
		description:
			'Exercise details with instructions, transcripts, and step progress.',
	},
	exercise_step_context: {
		name: 'exercise_step_context',
		description:
			'Step-specific instructions, transcripts, and progress details.',
	},
	diff_between_apps: {
		name: 'diff_between_apps',
		description: 'Git diff between two exercise apps.',
	},
	exercise_step_progress_diff: {
		name: 'exercise_step_progress_diff',
		description: 'Git diff between playground and solution for current step.',
	},
	user_info: {
		name: 'user_info',
		description: 'Authenticated user info for the current workshop.',
	},
	user_access: {
		name: 'user_access',
		description: 'Paid access status for the current user.',
	},
	user_progress: {
		name: 'user_progress',
		description: 'Progress list for the current user.',
	},
} satisfies Record<string, ResourceDoc>

export function formatToolDescription(doc: ToolDoc) {
	const lines: Array<string> = [doc.summary]

	if (doc.inputs.length) {
		lines.push('', 'Inputs:')
		for (const input of doc.inputs) {
			const requiredLabel = input.required ? 'required' : 'optional'
			const exampleText = input.examples?.length
				? ` Examples: ${input.examples.join(', ')}.`
				: ''
			lines.push(
				`- \`${input.name}\` (${input.type}, ${requiredLabel}) - ${input.description}${exampleText}`,
			)
		}
	}

	lines.push('', `Returns: ${doc.returns}`)

	if (doc.examples.length) {
		lines.push('', 'Examples:')
		for (const example of doc.examples) {
			lines.push(`- "${example.description}" -> ${example.params}`)
		}
	}

	if (doc.nextSteps.length) {
		lines.push('', 'Next steps:')
		for (const step of doc.nextSteps) {
			lines.push(`- ${step}`)
		}
	}

	return lines.join('\n').trim()
}

export function formatPromptDescription(doc: PromptDoc) {
	const lines: Array<string> = [doc.description]

	if (doc.examples.length) {
		lines.push('', 'Examples:')
		for (const example of doc.examples) {
			lines.push(`- ${example}`)
		}
	}

	if (doc.nextSteps.length) {
		lines.push('', 'Next steps:')
		for (const step of doc.nextSteps) {
			lines.push(`- ${step}`)
		}
	}

	return lines.join('\n').trim()
}
