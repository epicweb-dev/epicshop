import { json } from '@remix-run/node'
import { getProcesses } from '~/utils/process-manager.server'

export async function loader() {
	const processes: Record<
		string,
		{ port: number; pid?: number; color: string }
	> = {}
	for (const [name, { port, process, color }] of getProcesses().entries()) {
		processes[name] = { port, pid: process.pid, color }
	}
	return json({ processes })
}
