import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import { userHasAccessToWorkshop } from '@epic-web/workshop-utils/epic-api.server'
import {
	clearTestProcessEntry,
	getTestProcessEntry,
	isTestRunning,
	runAppTests,
} from '@epic-web/workshop-utils/process-manager.server'
import {
	data,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from 'react-router'
import { eventStream } from 'remix-utils/sse/server'
import { z } from 'zod'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { type TestEvent, type TestEventQueue } from './test-event-schema.ts'

const testActionSchema = z.union([
	z.object({
		intent: z.literal('run'),
		name: z.string(),
	}),
	z.object({
		intent: z.literal('stop'),
		name: z.string(),
	}),
	z.object({
		intent: z.literal('clear'),
		name: z.string(),
	}),
])

export async function loader({ request }: LoaderFunctionArgs) {
	ensureUndeployed()
	const url = new URL(request.url)
	const name = url.searchParams.get('name')
	if (!name) {
		return data({ error: 'Missing name' }, { status: 400 })
	}
	const app = await getAppByName(name)
	if (!app) {
		return data({ error: 'App not found' }, { status: 404 })
	}
	const processEntry = getTestProcessEntry(app)
	if (!processEntry) {
		return data({ error: 'App is not running tests' }, { status: 404 })
	}
	return eventStream(request.signal, function setup(send) {
		// have to batch because the client may miss events if we send too many
		// too rapidly
		let queue: TestEventQueue = []
		function sendEvent(event: TestEvent) {
			queue.push(event)
		}
		const interval = setInterval(() => {
			if (queue.length) {
				send({ data: JSON.stringify(queue) })
				queue = []
			}
		}, 10)

		const isRunning = isTestRunning(app)

		sendEvent({
			type: 'init',
			exitCode: processEntry.exitCode,
			isRunning,
			output: processEntry.output.map((line) => ({
				type: line.type,
				content: line.content,
				timestamp: line.timestamp,
			})),
		})

		const testProcess = processEntry.process
		if (!testProcess) {
			return () => {}
		}

		function handleStdOutData(data: Buffer) {
			sendEvent({
				type: 'stdout',
				data: data.toString('utf-8'),
				timestamp: Date.now(),
			})
		}
		function handleStdErrData(data: Buffer) {
			sendEvent({
				type: 'stderr',
				data: data.toString('utf-8'),
				timestamp: Date.now(),
			})
		}
		function handleExit(code: number) {
			testProcess?.stdout?.off('data', handleStdOutData)
			testProcess?.stderr?.off('data', handleStdErrData)
			testProcess?.off('exit', handleExit)
			sendEvent({ type: 'exit', isRunning: false, code })
		}
		testProcess.stdout?.on('data', handleStdOutData)
		testProcess.stderr?.on('data', handleStdErrData)
		testProcess.on('exit', handleExit)
		return function cleanup() {
			testProcess.stdout?.off('data', handleStdOutData)
			testProcess.stderr?.off('data', handleStdErrData)
			testProcess.off('exit', handleExit)
			clearInterval(interval)
		}
	})
}

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const userHasAccess = await userHasAccessToWorkshop({
		request,
	})
	if (!userHasAccess) {
		return dataWithPE(
			request,
			formData,
			{
				success: false,
				error:
					'You do not have access to this workshop. Login or register for the workshop to be able to run the tests.',
			},
			{
				status: 403,
				headers: await createToastHeaders({
					title: 'Access denied',
					description:
						'You do not have access to this workshop. Login or register for the workshop to be able to run the tests.',
				}),
			},
		)
	}
	const result = testActionSchema.safeParse({
		intent: formData.get('intent'),
		name: formData.get('name'),
	})
	if (!result.success) {
		return dataWithPE(
			request,
			formData,
			{ success: false, error: result.error.flatten() },
			{ status: 400 },
		)
	}
	const app = await getAppByName(result.data.name)
	if (!app) {
		return dataWithPE(
			request,
			formData,
			{ success: false, error: 'App not found' },
			{ status: 404 },
		)
	}
	switch (result.data.intent) {
		case 'run': {
			void runAppTests(app)
			return dataWithPE(request, formData, { success: true })
		}
		case 'stop': {
			const processEntry = getTestProcessEntry(app)
			if (processEntry) {
				processEntry.process?.kill()
			}
			return dataWithPE(request, formData, { success: true })
		}
		case 'clear': {
			clearTestProcessEntry(app)
			return dataWithPE(request, formData, { success: true })
		}
	}
}
