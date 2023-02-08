import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useFetcher } from 'react-router-dom'
import { z } from 'zod'
import { launchEditor } from '~/utils/launch-editor.server'

const launchSchema = z.object({
	file: z.string(),
	line: z.coerce.number().optional(),
	column: z.coerce.number().optional(),
})

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const { file, line, column } = launchSchema.parse({
		file: formData.get('file'),
		line: formData.get('line') ?? undefined,
		column: formData.get('column') ?? undefined,
	})
	await launchEditor(file, line, column)
	return json({ success: true })
}

export function LaunchEditor({
	file,
	line,
	column,
	children,
}: {
	file: string
	line?: number
	column?: number
	children: React.ReactNode
}) {
	const fetcher = useFetcher()
	return (
		<fetcher.Form action="/launch-editor" method="post">
			<input type="hidden" name="file" value={file} />
			<input type="hidden" name="line" value={line} />
			<input type="hidden" name="column" value={column} />
			<button type="submit">{children}</button>
		</fetcher.Form>
	)
}
