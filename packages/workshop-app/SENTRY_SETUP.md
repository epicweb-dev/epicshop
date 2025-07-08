# Sentry Setup Guide

This guide will help you set up Sentry reporting for your workshop application. Sentry is configured to work only in **production** and **published** environments to avoid noise during development.

## Prerequisites

1. A Sentry account (sign up at [sentry.io](https://sentry.io))
2. A Sentry project created for your application

## Configuration

### 1. Environment Variables

Copy the `.env.example` file to `.env` and fill in your Sentry configuration:

```bash
cp .env.example .env
```

Required environment variables:

- `SENTRY_DSN` - Your Sentry project DSN (always required)
- `SENTRY_ORG` - Your Sentry organization slug (optional, for sourcemaps)
- `SENTRY_PROJECT` - Your Sentry project slug (optional, for sourcemaps)
- `SENTRY_AUTH_TOKEN` - Your Sentry auth token (optional, for sourcemaps)

### 2. When Sentry is Active

Sentry will only initialize and capture errors when:
- `NODE_ENV=production` **OR**
- `EPICSHOP_DEPLOYED=true` (published environment)

This ensures no errors are captured during local development.

## Features Included

### Client-Side (React)
- **Error Reporting**: Automatic capture of JavaScript errors
- **Performance Monitoring**: Route change tracking and performance metrics
- **Session Replay**: Record user sessions for debugging (with privacy settings)
- **React Router v7 Integration**: Automatic route-based transaction names

### Server-Side (Node.js)
- **Error Reporting**: Automatic capture of server-side errors
- **Performance Monitoring**: Request tracing and performance metrics

### Build-Time
- **Source Maps**: Automatic upload of source maps for better error reporting
- **Release Tracking**: Automatic release creation and deployment tracking

## Sentry Configuration Details

### Sample Rates
- **Production**: 10% sampling rate for performance monitoring
- **Published**: 100% sampling rate for complete monitoring

### Error Filtering
The setup includes filtering for common development errors:
- `ResizeObserver loop limit exceeded` (client-side)
- `ENOENT` file not found errors (server-side)

### Privacy Settings
- Session replay is configured with `maskAllText: false` and `blockAllMedia: false`
- You can adjust these settings in `app/utils/sentry.client.ts` for your privacy requirements

## Getting Your Sentry DSN

1. Go to [sentry.io](https://sentry.io) and sign in
2. Create a new project or select an existing one
3. Go to **Settings** → **Projects** → **[Your Project]** → **Client Keys (DSN)**
4. Copy the DSN URL and add it to your `.env` file

## Setting Up Source Maps (Optional)

For better error reporting with original source code:

1. Create a Sentry auth token:
   - Go to **Settings** → **Account** → **API** → **Auth Tokens**
   - Create a new token with `project:releases` and `project:write` scopes

2. Add the token and project info to your `.env` file:
   ```
   SENTRY_AUTH_TOKEN=your-token-here
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=your-project-slug
   ```

3. Source maps will be automatically uploaded during production builds

## Testing Your Setup

To test Sentry in a production-like environment:

1. Set `NODE_ENV=production` or `EPICSHOP_DEPLOYED=true`
2. Build and run your application
3. Trigger an error (e.g., throw an error in a component)
4. Check your Sentry dashboard for the error

## Customization

### Adjusting Sample Rates
Edit `app/utils/sentry.client.ts` and `app/utils/sentry.server.ts` to modify:
- `tracesSampleRate` - Performance monitoring sample rate
- `replaysSessionSampleRate` - Session replay sample rate

### Adding Custom Error Handling
You can capture custom errors anywhere in your application:

```typescript
import { captureException } from '#app/utils/sentry.client'

try {
  // Your code here
} catch (error) {
  captureException(error, { extra: { customData: 'value' } })
}
```

## Troubleshooting

### Sentry Not Capturing Errors
- Verify your environment variables are set correctly
- Check that you're running in production or published environment
- Ensure your DSN is valid and the project is active

### Source Maps Not Working
- Verify your `SENTRY_AUTH_TOKEN` has the correct permissions
- Check that `SENTRY_ORG` and `SENTRY_PROJECT` match your Sentry project
- Ensure the build process completed successfully

## Support

If you encounter issues:
1. Check the Sentry documentation at [docs.sentry.io](https://docs.sentry.io)
2. Review the browser console for any Sentry-related errors
3. Check your Sentry project settings and quotas