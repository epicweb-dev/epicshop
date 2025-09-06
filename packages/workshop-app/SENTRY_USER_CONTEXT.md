# Sentry User Context Integration

This document explains how to use the enhanced Sentry error reporting with user context information.

## Overview

The Sentry integration now automatically includes user information when capturing errors, providing better context for debugging and monitoring. User information is retrieved from:

1. **Authenticated users**: User ID, email, and name from the authentication system
2. **Anonymous users**: Client ID for tracking anonymous sessions
3. **Fallback**: No user context if neither is available

## How It Works

### Server-Side (Automatic)

User context is automatically included in server-side error reports through:

- **`handleError` function** in `entry.server.tsx` - automatically captures user context for loader/action errors
- **Database error handling** in `db.server.ts` - includes user context for database corruption errors

### Client-Side (Manual)

For client-side error reporting, use the provided utility functions:

```typescript
import { captureClientError } from '#app/utils/sentry.client'
import { useOptionalUser } from '#app/components/user'
import { useRequestInfo } from '#app/utils/request-info'

function MyComponent() {
  const user = useOptionalUser()
  const requestInfo = useRequestInfo()
  
  const handleError = (error: Error) => {
    // Capture error with user context
    captureClientError(error, user, requestInfo.clientId)
  }
  
  // ... rest of component
}
```

## Available Functions

### `captureClientError(error: Error, user?: any, clientId?: string)`

Captures a client-side error with user context:

- `error`: The error to capture
- `user`: User object from `useOptionalUser()` (optional)
- `clientId`: Client ID from `useRequestInfo().clientId` (optional)

### `captureReactError(error: Error, errorInfo?: any)`

Captures React component errors (useful for error boundaries):

```typescript
import { captureReactError } from '#app/utils/sentry.client'

class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: any) {
    captureReactError(error, errorInfo)
  }
}
```

## User Context Information

When user information is available, Sentry will include:

- **User ID**: Unique identifier for the user
- **Email**: User's email address
- **Username**: User's display name or email
- **IP Address**: Excluded for privacy reasons

When only client ID is available:

- **User ID**: `client-{clientId}` format
- **Username**: "Anonymous User"

## Privacy Considerations

- IP addresses are never captured
- User information is only included when explicitly provided
- Client IDs are anonymized with a "client-" prefix

## Example Usage

### In a React Component

```typescript
import { captureClientError } from '#app/utils/sentry.client'
import { useOptionalUser } from '#app/components/user'
import { useRequestInfo } from '#app/utils/request-info'

function MyComponent() {
  const user = useOptionalUser()
  const requestInfo = useRequestInfo()
  
  const handleAsyncOperation = async () => {
    try {
      // ... async operation
    } catch (error) {
      // Capture error with full user context
      captureClientError(error, user, requestInfo.clientId)
    }
  }
  
  return <div>...</div>
}
```

### In an Error Boundary

```typescript
import { captureReactError } from '#app/utils/sentry.client'

class MyErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: any) {
    // React will provide error and errorInfo
    captureReactError(error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>
    }
    
    return this.props.children
  }
}
```

## Benefits

1. **Better Error Context**: Errors include user information for easier debugging
2. **User Impact Tracking**: Identify which users are affected by specific errors
3. **Anonymous User Tracking**: Track errors for users who haven't authenticated
4. **Privacy Conscious**: No sensitive information like IP addresses are captured
5. **Automatic Integration**: Server-side errors automatically include user context
6. **Simple API**: Easy-to-use functions for client-side error reporting

## Troubleshooting

If user context is not being captured:

1. Ensure the user is properly authenticated
2. Check that `clientId` is available in `requestInfo`
3. Verify Sentry is properly initialized
4. Check browser console for any Sentry-related errors