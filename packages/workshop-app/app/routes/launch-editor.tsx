import path from 'path'
import { getAppByName } from '@epic-web/workshop-utils/apps.server'
import { launchEditor } from '@epic-web/workshop-utils/launch-editor.server'
import fsExtra from 'fs-extra'
import { type ActionFunctionArgs } from 'react-router'
import { z, type ZodTypeAny } from 'zod'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { dataWithPE } from '#app/utils/pe.tsx'
import { createToastHeaders } from '#app/utils/toast.server.ts'

function getFileDescriptorSchema<AppFile extends ZodTypeAny>(appFile: AppFile) {
	return z.union([
		z.object({
			type: z.literal('file'),
			file: z.string(),
		}),
		z.object({
			type: z.literal('appFile'),
			appFile,
			appName: z.string(),
		}),
	])
}

const LaunchSchema = z.intersection(
	z.object({
		line: z.coerce.number().optional(),
		column: z.coerce.number().optional(),
		syncTo: getFileDescriptorSchema(z.string()).optional(),
	}),
	getFileDescriptorSchema(z.array(z.string())),
)

export async function action({ request }: ActionFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const syncTo = {
		type: formData.get('syncTo.type') ?? undefined,
		file: formData.get('syncTo.file') ?? undefined,
		workshopFile: formData.get('syncTo.workshopFile') ?? undefined,
		appFile: formData.getAll('syncTo.appFile'),
		appName: formData.get('syncTo.appName') ?? undefined,
	}
	const syncToIsProvided = Object.values(syncTo).some((v) =>
		Array.isArray(v) ? v.length : v,
	)
	const rawData = {
		type: formData.get('type'),
		file: formData.get('file'),
		workshopFile: formData.get('workshopFile'),
		appFile: formData.getAll('appFile'),
		appName: formData.get('appName'),
		line: formData.get('line') ?? undefined,
		column: formData.get('column') ?? undefined,
		syncTo: syncToIsProvided
			? {
					type: formData.get('syncTo.type'),
					file: formData.get('syncTo.file'),
					workshopFile: formData.get('syncTo.workshopFile'),
					appFile: formData.getAll('syncTo.appFile'),
					appName: formData.get('syncTo.appName'),
				}
			: undefined,
	}
	const form = LaunchSchema.parse(rawData)

	async function getFiles(
		fileDescriptor:
			| ({ line?: number; colum?: number } & {
					type: 'file'
					file: string
					appName?: never
					appFile?: never
			  })
			| {
					type: 'appFile'
					file?: never
					appName: string
					appFile: string | Array<string>
			  },
	): Promise<Array<{ filepath: string; line?: number; column?: number }>> {
		if (fileDescriptor.type === 'file') {
			return [
				{
					filepath: fileDescriptor.file,
					line: fileDescriptor.line,
					column: fileDescriptor.colum,
				},
			]
		} else {
			const fileDescriptorApp = await getAppByName(fileDescriptor.appName)
			if (!fileDescriptorApp) {
				throw new Response(`App "${fileDescriptor.appName}" Not found`, {
					status: 404,
				})
			}
			const appFile = Array.isArray(fileDescriptor.appFile)
				? fileDescriptor.appFile
				: [fileDescriptor.appFile]
			return appFile.map((file) => {
				const [filePath, line = '1', column = '1'] = file.split(',')
				if (!filePath) {
					throw new Response(
						`appFile missing file path: ${fileDescriptor.appFile}`,
						{ status: 400 },
					)
				}
				return {
					filepath: path.join(fileDescriptorApp.fullPath, filePath),
					line: Number(line),
					column: Number(column),
				}
			})
		}
	}

	const filesToOpen = await getFiles(form)
	if ('syncTo' in form && form.syncTo) {
		const originFiles = await getFiles(form.syncTo)
		for (let index = 0; index < originFiles.length; index++) {
			const originFile = originFiles[index]
			if (!originFile) continue
			const destFile = filesToOpen[index]
			if (!destFile) {
				throw new Response(
					`Trying to sync to a file that does not appear at index ${index}`,
				)
			}
			await fsExtra.ensureDir(path.dirname(destFile.filepath))
			await fsExtra.promises.copyFile(originFile.filepath, destFile.filepath)
		}
	}
	const results: Array<
		{ status: 'success' } | { status: 'error'; message: string }
	> = []
	for (const file of filesToOpen) {
		results.push(await launchEditor(file.filepath, file.line, file.column))
	}

	if (results.every((r) => r.status === 'success')) {
		return dataWithPE(request, formData, { status: 'success' } as const)
	} else {
		const messages = results
			.map((r, index, array) =>
				r.status === 'error'
					? array.length > 1
						? `${index}. ${r.message}`
						: r.message
					: null,
			)
			.filter(Boolean)
			.join('\n')
		console.error('Launch editor error:', messages)
		return dataWithPE(
			request,
			formData,
			{ status: 'error', message: messages } as const,
			{
				headers: await createToastHeaders({
					type: 'error',
					title: 'Launch Editor Error',
					description: messages,
				}),
			},
		)
	}
}
