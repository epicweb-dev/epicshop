# EpicShop MCP

Configure the MCP for your project with `npx -y @epic-web/workshop-mcp`.

Ask your LLM what it can do. And it'll tell you.

## Sentry Monitoring

This MCP server includes comprehensive Sentry monitoring for production-ready error tracking and performance monitoring.

### Features

- **Error Monitoring**: Automatic capture of MCP server errors, uncaught exceptions, and unhandled rejections
- **Performance Monitoring**: Transaction tracking for server initialization and main operations
- **Breadcrumbs**: Detailed logging of server operations for debugging
- **Environment-aware**: Different sampling rates for development vs production
- **Security**: Automatic filtering of sensitive data before sending to Sentry

### Setup

1. **Install Dependencies**: The Sentry dependency is already included in the package.

2. **Configure Environment Variables**: Copy `.env.example` to `.env` and configure your Sentry DSN:

```bash
cp .env.example .env
```

Edit `.env` and add your Sentry DSN:
```env
SENTRY_DSN=https://your-sentry-dsn-here@sentry.io/your-project-id
SENTRY_ENVIRONMENT=production
```

3. **Get Your Sentry DSN**:
   - Go to your Sentry project settings
   - Navigate to Settings → Projects → [Your Project] → Client Keys (DSN)
   - Copy the DSN URL

### Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SENTRY_DSN` | Required | Your Sentry project DSN |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` or `development` | Environment name |
| `SENTRY_RELEASE` | `npm_package_version` or `1.0.0` | Release version |
| `SENTRY_TRACES_SAMPLE_RATE` | `1.0` (dev) / `0.1` (prod) | Performance monitoring sample rate |
| `SENTRY_PROFILES_SAMPLE_RATE` | `1.0` (dev) / `0.1` (prod) | Profiling sample rate |

### What Gets Monitored

- **Server Initialization**: Component loading, tool registration, resource setup
- **Main Server Loop**: Connection establishment, transport setup
- **Error Handling**: All errors with context and stack traces
- **Process Events**: Graceful shutdown, uncaught exceptions
- **Performance**: Transaction timing for key operations

### Security Features

- Automatic filtering of sensitive fields (password, token, secret)
- Environment-based sampling to control data volume
- Graceful fallback if Sentry is unavailable

### Development vs Production

- **Development**: 100% sampling for comprehensive debugging
- **Production**: 10% sampling by default to manage costs
- **Customizable**: Adjust sampling rates via environment variables

### Troubleshooting

If Sentry isn't working:

1. Check that `SENTRY_DSN` is set correctly
2. Verify your Sentry project is active
3. Check console logs for initialization messages
4. Ensure your DSN has the correct permissions

### Example Usage

The monitoring is automatically enabled when you set the `SENTRY_DSN` environment variable. No code changes are needed - the server will automatically:

- Track all errors and performance metrics
- Add breadcrumbs for debugging
- Handle graceful shutdowns
- Filter sensitive data

For custom monitoring in your MCP tools, you can import the Sentry utilities:

```typescript
import { captureMcpError, startMcpTransaction, addMcpBreadcrumb } from './sentry.js'

// Track custom operations
const transaction = startMcpTransaction('custom_operation', 'mcp.tool.custom')
addMcpBreadcrumb('Starting custom operation', 'tool.operation')

try {
  // Your tool logic here
  transaction?.setStatus('ok')
} catch (error) {
  transaction?.setStatus('internal_error')
  captureMcpError(error, { context: 'custom_tool' })
} finally {
  transaction?.finish()
}
```
