import path from 'path'
import { invariantResponse } from '@epic-web/invariant'
import { makeTimings } from '@epic-web/workshop-utils/timing.server'
import etag from 'etag'
import fsExtra from 'fs-extra'
import mimeTypes from 'mime-types'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { z } from 'zod'
import { compileTs } from '#app/utils/compile-app.server.ts'
import {
	combineHeaders,
	ensureUndeployed,
	getBaseUrl,
} from '#app/utils/misc.tsx'
import { firstExisting, resolveApps } from './__utils.ts'

const EsbuildErrorLocationSchema = z.object({
	file: z.string().optional(),
	line: z.number().optional(),
	column: z.number().optional(),
	lineText: z.string().optional(),
})

const EsbuildErrorNoteSchema = z.object({
	text: z.string(),
})

const EsbuildErrorSchema = z.object({
	text: z.string(),
	location: EsbuildErrorLocationSchema.optional(),
	notes: z.array(EsbuildErrorNoteSchema).optional(),
})

const ErrorWithMessageSchema = z.object({
	message: z.string(),
})

function formatEsbuildError(error: unknown): string {
	// Handle string errors
	if (typeof error === 'string') {
		return error
	}

	// Try to parse as esbuild error
	const esbuildErrorResult = EsbuildErrorSchema.safeParse(error)
	if (esbuildErrorResult.success) {
		const esbuildError = esbuildErrorResult.data
		let message = esbuildError.text
		if (esbuildError.location) {
			const loc = esbuildError.location
			if (loc.file || loc.line || loc.column) {
				message += `\n  at ${loc.file || '<unknown>'}:${loc.line || 0}:${loc.column || 0}`
			}
			if (loc.lineText) {
				message += `\n  ${loc.lineText}`
				if (loc.column) {
					message += `\n  ${' '.repeat(Math.max(0, loc.column - 1))}^`
				}
			}
		}
		if (esbuildError.notes && esbuildError.notes.length > 0) {
			message += '\n\nNotes:'
			for (const note of esbuildError.notes) {
				message += `\n  ${note.text}`
			}
		}
		return message
	}

	// Try to parse as error with message property
	const errorWithMessageResult = ErrorWithMessageSchema.safeParse(error)
	if (errorWithMessageResult.success) {
		return errorWithMessageResult.data.message
	}

	// Fallback to string conversion
	return String(error)
}

function generateErrorJavaScript(
	errorMessage: string,
	filePath: string,
	appName: string,
	relativeFilePath: string,
	lineNumber?: number,
	columnNumber?: number,
): string {
	// Use JSON.stringify to properly escape the strings for JavaScript
	const errorMessageJson = JSON.stringify(errorMessage)
	const filePathJson = JSON.stringify(filePath)
	const appNameJson = JSON.stringify(appName)
	const relativeFilePathJson = JSON.stringify(relativeFilePath)
	const lineNumberJson = lineNumber !== undefined ? lineNumber : 'undefined'
	const columnNumberJson =
		columnNumber !== undefined ? columnNumber : 'undefined'

	return /* js */ `// Compilation Error
// File: ${filePathJson}

(function() {
	const errorMessage = ${errorMessageJson};
	const filePath = ${filePathJson};
	const appName = ${appNameJson};
	const relativeFilePath = ${relativeFilePathJson};
	const lineNumber = ${lineNumberJson};
	const columnNumber = ${columnNumberJson};

	// Log to console
	console.error('[Compilation Error] Failed to compile file "' + filePath + '"');
	console.error(errorMessage);

	// Display in DOM
	if (typeof document !== 'undefined') {
		const errorContainer = document.createElement('div');
		errorContainer.style.cssText = 'background: #fee; border-bottom: 2px solid #f00; padding: 1rem; font-family: monospace; font-size: 14px; color: #c00; max-height: 50vh; overflow-y: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
		
		const titleRow = document.createElement('div');
		titleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; gap: 1rem;';
		
		const title = document.createElement('div');
		title.style.cssText = 'font-weight: bold; font-size: 16px; flex: 1;';
		title.textContent = 'Compilation Error: ' + filePath;
		
		// Add button to open in editor
		const openButton = document.createElement('button');
		openButton.textContent = 'Open in Editor';
		openButton.style.cssText = 'background: #c00; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-size: 14px; font-family: inherit; white-space: nowrap;';
		openButton.onmouseover = function() { this.style.background = '#a00'; };
		openButton.onmouseout = function() { this.style.background = '#c00'; };
		openButton.onclick = function(e) {
			e.preventDefault();
			const formData = new FormData();
			formData.append('type', 'appFile');
			formData.append('appName', appName);
			const appFileValue = relativeFilePath + (lineNumber !== undefined ? ',' + lineNumber + (columnNumber !== undefined ? ',' + columnNumber : '') : '');
			formData.append('appFile', appFileValue);
			if (lineNumber !== undefined) {
				formData.append('line', String(lineNumber));
			}
			if (columnNumber !== undefined) {
				formData.append('column', String(columnNumber));
			}
			
			fetch('/launch-editor', {
				method: 'POST',
				body: formData
			}).catch(function(err) {
				console.error('Failed to launch editor:', err);
			});
		};
		
		titleRow.appendChild(title);
		titleRow.appendChild(openButton);
		
		const message = document.createElement('pre');
		message.style.cssText = 'margin: 0; white-space: pre-wrap; word-wrap: break-word;';
		message.textContent = errorMessage;
		
		errorContainer.appendChild(titleRow);
		errorContainer.appendChild(message);
		
		// Insert at the beginning of body so it pushes content down instead of overlapping
		if (document.body.firstChild) {
			document.body.insertBefore(errorContainer, document.body.firstChild);
		} else {
			document.body.appendChild(errorContainer);
		}
	}

	// Throw error so the app knows something went wrong
	throw new Error('Compilation failed: ' + errorMessage);
})();
`
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	ensureUndeployed()
	const timings = makeTimings('app-file')
	const { fileApp, app } = await resolveApps({ request, params, timings })
	if (!fileApp || !app) {
		throw new Response(`Apps not found`, { status: 404 })
	}
	if (app.dev.type === 'script') {
		return redirect(getBaseUrl({ request, port: app.dev.portNumber }))
	}
	const splat = params['*']
	invariantResponse(splat, 'splat required')

	const filePath = await firstExisting(
		path.join(app.fullPath, splat),
		path.join(fileApp.fullPath, splat),
	)
	if (!filePath) {
		throw new Response('File not found', { status: 404 })
	}
	if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
		// compile ts/tsx files
		const { outputFiles, errors } = await compileTs(filePath, app.fullPath, {
			request,
			timings,
		}).catch((error) => {
			let errors: Array<unknown>
			if (
				typeof error === 'object' &&
				error !== null &&
				'errors' in error &&
				Array.isArray((error as any).errors)
			) {
				errors = (error as { errors: unknown[] }).errors
			} else {
				errors = [error]
			}
			return { outputFiles: [], errors }
		})
		if (errors.length) {
			console.error(`Failed to compile file "${filePath}"`)
			console.error(errors)
			// For simple and export type apps, return error JavaScript instead of throwing
			if (app.dev.type === 'browser' || app.dev.type === 'export') {
				const errorMessage = errors.map(formatEsbuildError).join('\n\n')
				// Extract line/column from first error if it's an esbuild error
				let lineNumber: number | undefined
				let columnNumber: number | undefined
				const firstErrorResult = EsbuildErrorSchema.safeParse(errors[0])
				if (firstErrorResult.success && firstErrorResult.data.location) {
					lineNumber = firstErrorResult.data.location.line
					columnNumber = firstErrorResult.data.location.column
				}
				// Calculate relative file path from app's full path
				const relativeFilePath = path.relative(app.fullPath, filePath)
				const errorJs = generateErrorJavaScript(
					errorMessage,
					filePath,
					app.name,
					relativeFilePath,
					lineNumber,
					columnNumber,
				)
				return getFileResponse(errorJs, { 'Content-Type': 'text/javascript' })
			}
			const errorMessage = errors.map(formatEsbuildError).join('\n\n')
			throw new Response(errorMessage, { status: 500 })
		}
		if (!outputFiles?.[0]) {
			// For simple and export type apps, return error JavaScript instead of throwing
			if (app.dev.type === 'browser' || app.dev.type === 'export') {
				const errorMessage = 'Failed to compile file'
				const relativeFilePath = path.relative(app.fullPath, filePath)
				const errorJs = generateErrorJavaScript(
					errorMessage,
					filePath,
					app.name,
					relativeFilePath,
				)
				return getFileResponse(errorJs, { 'Content-Type': 'text/javascript' })
			}
			throw new Response('Failed to compile file', { status: 500 })
		}
		const file = outputFiles[0].text
		return getFileResponse(file, { 'Content-Type': 'text/javascript' })
	} else {
		const file = await fsExtra.readFile(filePath)
		const mimeType = mimeTypes.lookup(filePath) || 'text/plain'
		return getFileResponse(file, { 'Content-Type': mimeType })
	}

	function getFileResponse(file: Buffer | string, headers: HeadersInit = {}) {
		const etagValue = etag(file)
		const ifNoneMatch = request.headers.get('if-none-match')
		if (ifNoneMatch === etagValue) {
			return new Response(null, { status: 304 })
		}
		// @ts-ignore 🤷‍♂️ CLI doesn't like this but editor is fine 🙃
		return new Response(file, {
			headers: combineHeaders(
				{
					'Content-Length': Buffer.byteLength(file).toString(),
					'Server-Timing': timings.toString(),
					ETag: etagValue,
				},
				headers,
			),
		})
	}
}
