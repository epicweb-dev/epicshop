import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { z } from 'zod'
import { useRootLoaderData } from '~/root'
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
	const result = await launchEditor(file, line, column)
	return json(result)
}

export function LaunchEditor({
	file,
	workshopFile,
	line,
	column,
	children,
}: {
	file: string
	line?: number
	column?: number
	children: React.ReactNode
} & (
	| {
			file: string
			workshopFile: never
	  }
	| { file: never; workshopFile: string }
)) {
	const { workshopRoot } = useRootLoaderData()
	file = workshopFile ? `${workshopRoot}/${workshopFile}` : file
	const fetcher = useFetcher<typeof action>()
	return (
		<fetcher.Form action="/launch-editor" method="post">
			<input type="hidden" name="file" value={file} />
			<input type="hidden" name="line" value={line} />
			<input type="hidden" name="column" value={column} />
			<button type="submit" className="">
				{children}
			</button>
			{fetcher.data?.status === 'error' ? (
				<div className="error">{fetcher.data.error}</div>
			) : null}
		</fetcher.Form>
	)
}
