import {
	startCommand,
	updateCommand,
	warmCommand,
	openWorkshop,
	checkForUpdates,
	dismissUpdateNotification,
	initializeEnvironment,
	type StartCommandOptions,
	type CommandResult,
} from '@epic-web/workshop-cli'

// Example usage of the programmatic CLI interface

async function example() {
	// Initialize the environment first (required)
	console.log('Initializing environment...')
	const initResult = await initializeEnvironment()
	if (!initResult.success) {
		console.error('Failed to initialize environment:', initResult.message)
		return
	}
	console.log('✅', initResult.message)

	// Check for updates
	console.log('\nChecking for updates...')
	const updateCheck = await checkForUpdates()
	console.log(updateCheck.success ? '✅' : '❌', updateCheck.message)
	if (updateCheck.updatesAvailable) {
		console.log(`📖 View changes: ${updateCheck.diffLink}`)
	}

	// Warm up caches
	console.log('\nWarming up caches...')
	const warmResult = await warmCommand()
	console.log(warmResult.success ? '✅' : '❌', warmResult.message)
	if (warmResult.error) {
		console.error('Error details:', warmResult.error)
	}

	// Start the workshop (with options)
	console.log('\nStarting workshop...')
	const startOptions: StartCommandOptions = {
		verbose: true,
		// appLocation: '/path/to/custom/workshop-app', // optional
	}
	
	const startResult = await startCommand(startOptions)
	console.log(startResult.success ? '✅' : '❌', startResult.message)
	if (startResult.error) {
		console.error('Error details:', startResult.error)
	}

	// Open workshop in browser (after a short delay)
	setTimeout(async () => {
		console.log('\nOpening workshop in browser...')
		const openResult = await openWorkshop()
		console.log(openResult.success ? '✅' : '❌', openResult.message)
	}, 3000)

	// Example of updating (uncomment to test)
	// console.log('\nUpdating workshop...')
	// const updateResult = await updateCommand()
	// console.log(updateResult.success ? '✅' : '❌', updateResult.message)

	// Example of dismissing update notifications
	// console.log('\nDismissing update notifications...')
	// const dismissResult = await dismissUpdateNotification()
	// console.log(dismissResult.success ? '✅' : '❌', dismissResult.message)
}

// Run the example
example().catch(console.error)