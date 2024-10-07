import { getProcesses } from '@epic-web/workshop-utils/process-manager.server'
import { ensureUndeployed } from '#app/utils/misc.tsx'

export async function loader() {
	ensureUndeployed()
	const processes: Record<
		string,
		{ port: number; pid?: number; color: string }
	> = {}
	for (const [
		name,
		{ port, process, color },
	] of getProcesses().devProcesses.entries()) {
		processes[name] = { port, pid: process.pid, color }
	}
	const testProcesses: Record<
		string,
		{ pid?: number; exitCode?: number | null; output?: Array<any> }
	> = {}
	for (const [
		name,
		{ process, exitCode, output },
	] of getProcesses().testProcesses.entries()) {
		testProcesses[name] = { pid: process?.pid, exitCode, output }
	}
	return Response.json({ processes, testProcesses })
}
