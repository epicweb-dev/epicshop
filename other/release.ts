import fs from 'fs-extra'
import { workspaceRoot, createProjectGraphAsync } from '@nx/devkit'
import { findMatchingProjects } from 'nx/src/utils/find-matching-projects.js'
import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release'
import path from 'path'
import { default as yargs } from 'yargs'

process.env.NX_DAEMON = 'false'

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
		description: 'Whether or not to enable verbose logging, defaults to false',
		type: 'boolean',
		default: false,
	})
	.parseAsync()

// get the projects from the nx.json in the parent directory
const nxJsonPath = path.join(workspaceRoot, 'nx.json')
const nxJson = await fs.readJSON(nxJsonPath)
const graph = await createProjectGraphAsync()
const projects = findMatchingProjects(nxJson.release.projects, graph.nodes)

for (const project of projects) {
	const projectNode = graph.nodes[project]
	if (!projectNode) {
		throw new Error('ahhhhhhhhhhhhhhhhhh! This should be unpossible!')
	}

	const srcPath = path.join(workspaceRoot, projectNode.data.root)
	const publishPath = path.join(workspaceRoot, 'publish', projectNode.data.root)

	const packageJsonPath = path.join(srcPath, 'package.json')
	const packageJson = await fs.readJson(packageJsonPath)
	const filesToCopy = [
		...(packageJson.files ?? []),
		'README.md',
		'package.json',
	]

	await Promise.all(
		filesToCopy.map(async (file: string) => {
			const sourcePath = path.join(srcPath, file)
			const destinationPath = path.join(publishPath, file)
			await fs.copy(sourcePath, destinationPath)
		}),
	)
}

const { workspaceVersion, projectsVersionData } = await releaseVersion({
	gitCommit: false,
	stageChanges: false,
	gitTag: false,
	specifier: options.version,
	dryRun: options.dryRun,
	verbose: options.verbose,
})

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

await releasePublish({
	dryRun: options.dryRun,
	verbose: options.verbose,
})
