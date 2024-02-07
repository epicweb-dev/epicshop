import fs from 'fs-extra'
import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release'
import path from 'path'
import { fileURLToPath } from 'url'
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

// for the project in packages/workshop-app: copy README.md, package.json, and the files mentioned in the package.json files property to a publish folder
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const workshopAppPath = path.join(__dirname, '..', 'packages', 'workshop-app')
const publishPath = path.join(
	__dirname,
	'..',
	'publish',
	'packages',
	'workshop-app',
)

const packageJsonPath = path.join(workshopAppPath, 'package.json')
const packageJson = await fs.readJson(packageJsonPath)
const filesToCopy = [...(packageJson.files ?? []), 'README.md', 'package.json']

await Promise.all(
	filesToCopy.map(async (file: string) => {
		const sourcePath = path.join(workshopAppPath, file)
		const destinationPath = path.join(publishPath, file)
		await fs.copy(sourcePath, destinationPath)
	}),
)

const { workspaceVersion, projectsVersionData } = await releaseVersion({
	gitCommit: false,
	stageChanges: false,
	specifier: options.version,
	dryRun: options.dryRun,
	verbose: options.verbose,
})

if (process.env.CI || options.dryRun) {
	await releaseChangelog({
		gitCommit: false,
		stageChanges: false,
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
