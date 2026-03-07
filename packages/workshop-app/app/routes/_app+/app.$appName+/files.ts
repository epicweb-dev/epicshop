import { type Route } from './+types/files'
import path from 'node:path'
import { makeTimings, getServerTimeHeader } from '@epic-web/workshop-utils/timing.server'
import { globby } from 'globby'
import mimeTypes from 'mime-types'
import { data } from 'react-router'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { resolveApps } from './__utils.ts'

type PreviewKind = 'text' | 'markdown' | 'image' | 'video' | 'binary'

const markdownExtensions = new Set(['.md', '.mdx', '.markdown'])
const imageExtensions = new Set([
	'.avif',
	'.bmp',
	'.gif',
	'.ico',
	'.jpeg',
	'.jpg',
	'.png',
	'.svg',
	'.webp',
])
const videoExtensions = new Set([
	'.avi',
	'.m4v',
	'.mkv',
	'.mov',
	'.mp4',
	'.mpeg',
	'.mpg',
	'.ogv',
	'.webm',
])
const textExtensions = new Set([
	'.c',
	'.cc',
	'.cpp',
	'.css',
	'.csv',
	'.cts',
	'.go',
	'.graphql',
	'.h',
	'.hpp',
	'.html',
	'.java',
	'.js',
	'.json',
	'.jsx',
	'.mjs',
	'.mts',
	'.php',
	'.py',
	'.rb',
	'.rs',
	'.sass',
	'.scss',
	'.sh',
	'.sql',
	'.toml',
	'.ts',
	'.tsx',
	'.txt',
	'.vue',
	'.xml',
	'.yaml',
	'.yml',
])
const languageByExtension = new Map<string, string>([
	['.c', 'c'],
	['.cc', 'cpp'],
	['.cpp', 'cpp'],
	['.css', 'css'],
	['.csv', 'csv'],
	['.cts', 'typescript'],
	['.go', 'go'],
	['.graphql', 'graphql'],
	['.h', 'c'],
	['.hpp', 'cpp'],
	['.html', 'html'],
	['.java', 'java'],
	['.js', 'javascript'],
	['.json', 'json'],
	['.jsx', 'jsx'],
	['.md', 'markdown'],
	['.mdx', 'mdx'],
	['.mjs', 'javascript'],
	['.mts', 'typescript'],
	['.php', 'php'],
	['.py', 'python'],
	['.rb', 'ruby'],
	['.rs', 'rust'],
	['.sass', 'sass'],
	['.scss', 'scss'],
	['.sh', 'bash'],
	['.sql', 'sql'],
	['.svg', 'svg'],
	['.toml', 'toml'],
	['.ts', 'typescript'],
	['.tsx', 'tsx'],
	['.txt', 'text'],
	['.vue', 'vue'],
	['.xml', 'xml'],
	['.yaml', 'yaml'],
	['.yml', 'yaml'],
])

function getPreviewKind(filePath: string, mimeType: string): PreviewKind {
	const extension = path.extname(filePath).toLowerCase()
	if (markdownExtensions.has(extension)) return 'markdown'
	if (imageExtensions.has(extension)) return 'image'
	if (videoExtensions.has(extension)) return 'video'
	if (textExtensions.has(extension)) return 'text'
	if (mimeType.startsWith('image/')) return 'image'
	if (mimeType.startsWith('video/')) return 'video'
	if (
		mimeType.startsWith('text/') ||
		mimeType === 'application/json' ||
		mimeType === 'application/javascript' ||
		mimeType === 'application/xml'
	) {
		return 'text'
	}
	return 'binary'
}

export async function loader({ request, params }: Route.LoaderArgs) {
	ensureUndeployed()
	const timings = makeTimings('app-files')
	const { app, fileApp } = await resolveApps({ request, params, timings })
	if (!app || !fileApp) {
		throw new Response(`Apps not found`, { status: 404 })
	}

	const roots = [app.fullPath]
	if (fileApp.fullPath !== app.fullPath) roots.push(fileApp.fullPath)

	const filesByPath = new Map<
		string,
		{
			path: string
			mimeType: string
			kind: PreviewKind
			language: string | null
		}
	>()

	for (const root of roots) {
		const files = await globby('**/*', {
			cwd: root,
			onlyFiles: true,
			dot: true,
			gitignore: true,
		})
		for (const file of files) {
			const normalizedPath = file.replace(/\\/g, '/')
			if (path.basename(normalizedPath) === 'README.mdx') continue
			if (filesByPath.has(normalizedPath)) continue
			const mimeType = mimeTypes.lookup(normalizedPath) || 'application/octet-stream'
			const extension = path.extname(normalizedPath).toLowerCase()
			filesByPath.set(normalizedPath, {
				path: normalizedPath,
				mimeType,
				kind: getPreviewKind(normalizedPath, mimeType),
				language: languageByExtension.get(extension) ?? null,
			})
		}
	}

	const files = [...filesByPath.values()].sort((a, b) =>
		a.path.localeCompare(b.path),
	)

	return data(
		{ files },
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}
