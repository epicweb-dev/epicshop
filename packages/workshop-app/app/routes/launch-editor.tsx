import { useEffect } from 'react'
import path from 'path'
import type { DataFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { getAppByName } from '~/utils/apps.server'
import { z } from 'zod'
import { launchEditor } from '~/utils/launch-editor.server'
import clsx from 'clsx'
import { showToast } from '~/components/toast'

const launchSchema = z.intersection(
	z.object({
		line: z.coerce.number().optional(),
		column: z.coerce.number().optional(),
	}),
	z.union([
		z.object({
			type: z.literal('file'),
			file: z.string(),
		}),
		z.object({
			type: z.literal('appFile'),
			appFile: z.array(z.string()),
			appName: z.string(),
		}),
	]),
)

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const rawData = {
		type: formData.get('type'),
		file: formData.get('file'),
		workshopFile: formData.get('workshopFile'),
		appFile: formData.getAll('appFile'),
		appName: formData.get('appName'),
		line: formData.get('line') ?? undefined,
		column: formData.get('column') ?? undefined,
	}
	const form = launchSchema.parse(rawData)
	let file
	switch (form.type) {
		case 'file': {
			file = form.file
			break
		}
		case 'appFile': {
			const app = await getAppByName(form.appName)
			if (!app) {
				throw new Response(`App "${form.appName}" Not found`, { status: 404 })
			}
			file = form.appFile.map(filePath => path.join(app?.fullPath, filePath))
			break
		}
	}
	const result = await launchEditor(file, form.line, form.column)
	return json(result)
}

export function LaunchEditor({
	file,
	appFile,
	appName,
	line,
	column,
	children,
	onUpdate,
}: {
	line?: number
	column?: number
	children: React.ReactNode
	onUpdate?: (state: string) => void
} & (
	| { file: string; appFile?: never; appName?: never }
	| { file?: never; appFile: string | string[]; appName: string }
)) {
	const fetcher = useFetcher<typeof action>()

	useEffect(() => {
		switch (fetcher.state) {
			case 'loading': {
				const error = fetcher.data?.status === 'error' ? fetcher.data.error : ''
				if (error) {
					showToast(document, {
						title: 'Launch Editor Error',
						variant: 'Error',
						content: error,
					})
				}
			}
			case 'idle': {
				if (fetcher.data != null) onUpdate?.('fetcher-done')
			}
		}
	}, [fetcher, onUpdate])

	const fileList = typeof appFile === 'string' ? [appFile] : appFile
	const type = file ? 'file' : appFile ? 'appFile' : ''
	return (
		<fetcher.Form action="/launch-editor" method="POST">
			<input type="hidden" name="line" value={line} />
			<input type="hidden" name="column" value={column} />
			<input type="hidden" name="type" value={type} />
			<input type="hidden" name="file" value={file} />
			<input type="hidden" name="appName" value={appName} />
			{fileList?.map(file => (
				<input type="hidden" name="appFile" key={file} value={file} />
			))}
			<button
				type="submit"
				className={clsx(
					'launch_button',
					fetcher.state !== 'idle' ? 'cursor-progress' : null,
					fetcher.data?.status === 'error' ? 'cursor-not-allowed' : null,
				)}
			>
				{children}
			</button>
		</fetcher.Form>
	)
}
