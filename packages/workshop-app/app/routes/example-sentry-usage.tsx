import { json, type LoaderFunctionArgs } from 'react-router'
import { useLoaderData } from 'react-router'
import { getUserId } from '@epic-web/workshop-utils/user.server'
import { 
	setSentryUserContext, 
	clearSentryUserContext,
	withSentryUserContext 
} from '../utils/sentry-context.server'
import { useSentryUser } from '../hooks/use-sentry-user'

/**
 * Example loader showing how to manually set Sentry user context
 */
export async function loader({ request }: LoaderFunctionArgs) {
	// Get user information
	const userInfo = await getUserId({ request })
	
	// Method 1: Manual context setting
	await setSentryUserContext(userInfo.id, userInfo.type)
	
	try {
		// Your loader logic here
		const data = {
			message: 'User context set manually in loader',
			userId: userInfo.id,
			userType: userInfo.type,
			timestamp: new Date().toISOString()
		}
		
		return json(data)
	} finally {
		// Always clear context when done
		await clearSentryUserContext()
	}
}

/**
 * Example action showing how to use the wrapper function
 */
export async function action({ request }: LoaderFunctionArgs) {
	const userInfo = await getUserId({ request })
	
	// Method 2: Using the wrapper function (recommended)
	return withSentryUserContext(async () => {
		// Your action logic here
		const formData = await request.formData()
		const action = formData.get('action')
		
		// Simulate some work
		await new Promise(resolve => setTimeout(resolve, 100))
		
		if (action === 'error') {
			throw new Error('This is a test error to demonstrate Sentry user context')
		}
		
		return json({ 
			success: true, 
			action,
			message: 'Action completed with user context',
			userId: userInfo.id,
			userType: userInfo.type
		})
	}, userInfo.id, userInfo.type)
}

/**
 * Example component showing how to use the React hooks
 */
export default function ExampleSentryUsage() {
	const data = useLoaderData<typeof loader>()
	
	// Method 3: Using React hooks (automatic)
	useSentryUser(data.userId, data.userType)
	
	return (
		<div className="container mx-auto p-8 max-w-4xl">
			<h1 className="text-3xl font-bold mb-6">Sentry User Context Examples</h1>
			
			<div className="space-y-6">
				{/* Manual Context Setting Example */}
				<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-blue-800 mb-3">
						Manual Context Setting (Loader)
					</h2>
					<p className="text-blue-700 mb-2">
						This example shows how user context is manually set in the loader.
					</p>
					<div className="bg-white p-4 rounded border">
						<strong>User ID:</strong> {data.userId}<br />
						<strong>User Type:</strong> {data.userType}<br />
						<strong>Message:</strong> {data.message}<br />
						<strong>Timestamp:</strong> {data.timestamp}
					</div>
				</div>
				
				{/* Action with Context Wrapper Example */}
				<div className="bg-green-50 border border-green-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-green-800 mb-3">
						Context Wrapper (Action)
					</h2>
					<p className="text-green-700 mb-2">
						This example shows how to use the wrapper function for actions.
					</p>
					<form method="post" className="space-y-3">
						<div>
							<label className="block text-sm font-medium text-green-700 mb-1">
								Action to perform:
							</label>
							<select 
								name="action" 
								className="w-full p-2 border border-green-300 rounded focus:ring-2 focus:ring-green-500"
								defaultValue="success"
							>
								<option value="success">Success Action</option>
								<option value="error">Trigger Error (for testing)</option>
							</select>
						</div>
						<button 
							type="submit"
							className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 focus:ring-2 focus:ring-green-500"
						>
							Submit Action
						</button>
					</form>
				</div>
				
				{/* React Hook Example */}
				<div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-purple-800 mb-3">
						React Hook (Component)
					</h2>
					<p className="text-purple-700 mb-2">
						This example shows how the component automatically sets user context.
					</p>
					<div className="bg-white p-4 rounded border">
						<strong>Status:</strong> User context automatically set via useSentryUser hook<br />
						<strong>User ID:</strong> {data.userId}<br />
						<strong>User Type:</strong> {data.userType}
					</div>
				</div>
				
				{/* Information Panel */}
				<div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-gray-800 mb-3">
						How It Works
					</h2>
					<div className="space-y-3 text-gray-700">
						<p>
							<strong>1. Automatic Context:</strong> User context is automatically captured 
							for all HTTP requests through Express middleware.
						</p>
						<p>
							<strong>2. Manual Control:</strong> Use the utility functions to manually 
							set user context in loaders, actions, or other server-side code.
						</p>
						<p>
							<strong>3. React Integration:</strong> Use the React hooks to automatically 
							set user context when user information changes.
						</p>
						<p>
							<strong>4. Error Boundaries:</strong> User context is automatically included 
							in error reports, even when errors occur.
						</p>
					</div>
				</div>
				
				{/* Testing Instructions */}
				<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-yellow-800 mb-3">
						Testing Sentry User Context
					</h2>
					<div className="space-y-3 text-yellow-700">
						<p>
							<strong>To test user context in Sentry:</strong>
						</p>
						<ol className="list-decimal list-inside space-y-1 ml-4">
							<li>Submit the form above with "Trigger Error" selected</li>
							<li>Check your Sentry dashboard for the error</li>
							<li>Verify that the user ID and user type are included</li>
							<li>Filter errors by user ID or user type tags</li>
						</ol>
						<p className="mt-3 text-sm">
							<strong>Note:</strong> Make sure Sentry is properly configured with your DSN 
							and environment variables.
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}