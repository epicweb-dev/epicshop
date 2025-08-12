# Sentry User Context Configuration

This document explains how to use the enhanced Sentry configuration that automatically includes user ID in error reports.

## Overview

The Sentry configuration has been enhanced to automatically capture user context for better error tracking and debugging. User IDs are now included in all error reports, making it easier to:

- Track errors per user
- Debug user-specific issues
- Filter error reports by user type
- Understand the impact of errors on specific users

## Automatic User Context

### Server-Side (Express Middleware)

User context is automatically captured for all HTTP requests through Express middleware. The system:

1. Extracts user ID from cookies or authentication
2. Sets the user context in Sentry for each request
3. Includes user type (e.g., 'cookie.clientId', 'db.authInfo', 'db.clientId')
4. Automatically detects and includes IP addresses

### Client-Side

The client-side Sentry configuration includes:
- `sendDefaultPii: true` for automatic user context detection
- User context utilities for manual control

## Manual User Context Control

### React Hooks

Use these hooks in your React components to manually control user context:

```tsx
import { useSentryUser, useSentryUserFromObject } from '~/hooks/use-sentry-user'

// Set user context with individual parameters
function MyComponent({ userId, userType }) {
  useSentryUser(userId, userType)
  // ... rest of component
}

// Set user context from user object
function MyComponent({ user }) {
  useSentryUserFromObject(user)
  // ... rest of component
}
```

### Server-Side Utilities

Use these utilities in your loaders, actions, or other server-side code:

```tsx
import { 
  setSentryUserContext, 
  clearSentryUserContext,
  withSentryUserContext 
} from '~/utils/sentry-context.server'

// Set user context manually
export async function loader({ request }: LoaderFunctionArgs) {
  const userInfo = await getUserId({ request })
  await setSentryUserContext(userInfo.id, userInfo.type)
  
  try {
    // Your loader logic here
    return json({ data: 'success' })
  } finally {
    // Clear context when done
    await clearSentryUserContext()
  }
}

// Or use the wrapper function
export async function action({ request }: ActionFunctionArgs) {
  const userInfo = await getUserId({ request })
  
  return withSentryUserContext(async () => {
    // Your action logic here
    return json({ success: true })
  }, userInfo.id, userInfo.type)
}
```

## User Types

The system recognizes these user types:

- `cookie.clientId` - User identified by client ID cookie
- `cookie.randomId` - User with randomly generated ID
- `db.authInfo` - Authenticated user from database
- `db.clientId` - User with client ID from database

## Configuration

### Environment Variables

Ensure these environment variables are set:

```bash
SENTRY_DSN=your_sentry_dsn
SENTRY_ORG=your_org
SENTRY_PROJECT=your_project
SENTRY_AUTH_TOKEN=your_auth_token
```

### Sentry Dashboard

In your Sentry dashboard, you can now:

1. **Filter by User ID**: Use the user ID to find all errors for a specific user
2. **Filter by User Type**: Use the `user_type` tag to filter errors by authentication method
3. **User Impact Analysis**: See which users are most affected by specific errors
4. **Personal Information**: Access user context in error details (respecting privacy settings)

## Privacy Considerations

- User IDs are automatically anonymized in Sentry
- IP addresses are automatically detected but can be controlled
- No sensitive user data is sent unless explicitly configured
- The `sendDefaultPii: true` setting enables automatic user context detection

## Troubleshooting

### User Context Not Appearing

1. Check that Sentry is properly initialized
2. Verify that `getUserId()` is returning valid user information
3. Check browser console for any Sentry-related warnings
4. Ensure the user context utilities are properly imported

### Performance Impact

The user context capture is designed to be lightweight:
- Asynchronous operations don't block request processing
- Context is cleared after each request to prevent memory leaks
- Failed context setting doesn't affect application functionality

## Examples

### Complete Component Example

```tsx
import { useSentryUser } from '~/hooks/use-sentry-user'
import { getUserId } from '~/utils/user.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const userInfo = await getUserId({ request })
  return json({ userInfo })
}

export default function UserProfile() {
  const { userInfo } = useLoaderData<typeof loader>()
  
  // Automatically set Sentry user context
  useSentryUser(userInfo.id, userInfo.type)
  
  return (
    <div>
      <h1>User Profile</h1>
      <p>User ID: {userInfo.id}</p>
      <p>Type: {userInfo.type}</p>
    </div>
  )
}
```

### Error Boundary with User Context

```tsx
import { useSentryUser } from '~/hooks/use-sentry-user'

export function ErrorBoundary() {
  const { userInfo } = useLoaderData<typeof loader>()
  
  // Set user context even in error boundaries
  useSentryUser(userInfo?.id, userInfo?.type)
  
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>We've been notified and are working on a fix.</p>
    </div>
  )
}
```