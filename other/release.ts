import path from 'path'
import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit'
import fs from 'fs-extra'
import {
	releaseChangelog,
	releasePublish,
	releaseVersion,
} from 'nx/release/index.js'
import { findMatchingProjects } from 'nx/src/utils/find-matching-projects.js'
import { default as yargs } from 'yargs'

async function go() {
	try {
		const options = await yargs(process.argv)
			.version(false) // don't use the default meaning of version in yargs
			.option('version', {
				description:
					'Explicit version specifier to use, if overriding conventional commits',
				type: 'string',
			})
			.option('dryRun', {
				alias: 'd',
				description:
					'Whether or not to perform a dry-run of the release process, defaults to true',
				type: 'boolean',
				default: true,
			})
			.option('verbose', {
				description:
					'Whether or not to enable verbose logging, defaults to false',
				type: 'boolean',
				default: false,
			})
			.parseAsync()

		// get the projects from the nx.json in the parent directory
		const nxJsonPath = path.join(workspaceRoot, 'nx.json')
		const nxJson = await fs.readJSON(nxJsonPath)
		const graph = await createProjectGraphAsync()
		const projects = findMatchingProjects(nxJson.release.projects, graph.nodes)
		const publishDir = path.join(workspaceRoot, 'publish')

		await fs.remove(publishDir)

		for (const project of projects) {
			const projectNode = graph.nodes[project]
			if (!projectNode) {
				throw new Error(
					`ahhhhhhhhhhhhhhhhhh! This should be unpossible! There is no projectNode in graph.nodes for "${project}"`,
				)
			}

			const srcPath = path.join(workspaceRoot, projectNode.data.root)
			const publishPath = path.join(publishDir, projectNode.data.root)

			const packageJsonPath = path.join(srcPath, 'package.json')
			const packageJson = await fs.readJson(packageJsonPath)
			const hasBundleDependencies = packageJson.bundleDependencies?.length > 0
			const filesToCopy = [
				...(packageJson.files ?? []),
				'README.md',
				'package.json',
				hasBundleDependencies ? 'node_modules' : null,
			].filter(Boolean)

			await Promise.all(
				filesToCopy.map(async (file: string) => {
					const sourcePath = path.join(srcPath, file)
					const destinationPath = path.join(publishPath, file)
					if (await fs.pathExists(sourcePath)) {
						await fs.copy(sourcePath, destinationPath)
					}
				}),
			)

			if (hasBundleDependencies) {
				const exclude = [
					`${path.sep}.bin${path.sep}`,
					`${path.sep}.vite${path.sep}`,
					`${path.sep}.cache${path.sep}`,
				]

				await fs.copy(
					path.join(workspaceRoot, 'node_modules'),
					path.join(publishPath, 'node_modules'),
					{
						overwrite: false,
						dereference: false,
						filter: (srcPath: string) =>
							!exclude.some((e) => srcPath.includes(e)),
					},
				)
			}
		}

		const { workspaceVersion, projectsVersionData } = await releaseVersion({
			gitCommit: false,
			stageChanges: false,
			gitTag: false,
			specifier: options.version,
			dryRun: options.dryRun,
			verbose: options.verbose,
		})

		// update local package references to the new version
		for (const project of projects) {
			const projectNode = graph.nodes[project]
			if (!projectNode) {
				throw new Error(
					`ahhhhhhhhhhhhhhhhhh! This should be unpossible! There is no projectNode in graph.nodes for "${project}"`,
				)
			}

			const publishPath = path.join(publishDir, projectNode.data.root)

			const packageJsonPath = path.join(publishPath, 'package.json')
			const packageJson = await fs.readJson(packageJsonPath)
			packageJson.dependencies = packageJson.dependencies ?? {}
			for (const [dependency, version] of Object.entries(
				packageJson.dependencies,
			)) {
				if (typeof version !== 'string') continue
				if (!version.startsWith('file:')) continue
				const depVersionData = projectsVersionData[dependency]
				if (!depVersionData) continue

				if (depVersionData.newVersion) {
					packageJson.dependencies[dependency] = `^${depVersionData.newVersion}`
				} else if (depVersionData.currentVersion) {
					packageJson.dependencies[dependency] =
						`^${depVersionData.currentVersion}`
				} else {
					packageJson.dependencies[dependency] = `^${workspaceVersion}`
				}
			}
			await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 })
		}

		if (workspaceVersion === null) {
			console.log('No relevant changes detected, skipping release process.')
			process.exit(0)
		} else {
			if (process.env.CI || options.dryRun) {
				await releaseChangelog({
					gitCommit: false,
					stageChanges: false,
					gitTag: false,
					versionData: projectsVersionData,
					version: workspaceVersion,
					dryRun: options.dryRun,
					verbose: options.verbose,
				})
			}

			const publishProjectsResult = await releasePublish({
				dryRun: options.dryRun,
				verbose: options.verbose,
			})

			const nonZeroExitCodes: Array<number> = []
			for (const [project, publishProjectResult] of Object.entries(
				publishProjectsResult,
			)) {
				if (publishProjectResult.code !== 0) {
					console.error(
						`Error publishing ${project}: ${publishProjectResult.code}`,
					)
					nonZeroExitCodes.push(publishProjectResult.code)
				}
			}

			if (nonZeroExitCodes.length > 0) {
				process.exit(1)
			} else {
				process.exit(0)
			}
		}
	} catch (err) {
		if (err instanceof Error && /nx cloud/i.test(err.message)) {
			console.log(
				'Nx Cloud failed, retrying without cloud...',
				err.message.replace(/nx cloud/i, ''),
			)
			process.env.NX_NO_CLOUD = 'true'
			return go()
		}
		console.error(err)
		process.exit(1)
	}
}

await go()
