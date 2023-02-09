import { json } from '@remix-run/node'
import { getProcesses } from '~/utils/process-manager.server'

export async function loader() {
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
	return json({ processes, testProcesses })
}
