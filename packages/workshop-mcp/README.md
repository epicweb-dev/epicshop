# EpicShop MCP

Configure the MCP for your project with `npx -y @epic-web/workshop-mcp`.

Ask your LLM what it can do. And it'll tell you.

## Sentry Monitoring

This MCP server includes Sentry monitoring following the pattern described in [Sentry's MCP server monitoring blog post](https://blog.sentry.io/introducing-mcp-server-monitoring/).

### Features

- **Simple Integration**: Uses the `wrapMcpServerWithSentry(McpServer)` pattern
- **Automatic Configuration**: Uses environment variables from your workshop configuration
- **Production Only**: Only enables monitoring when `EPICSHOP_IS_PUBLISHED` is true
- **Graceful Shutdown**: Uses `close-with-grace` for clean server termination

### Setup

The Sentry integration is automatically configured using your existing workshop environment variables:

- `SENTRY_DSN`: Your Sentry project DSN (already configured in workshop-utils)
- `EPICSHOP_IS_PUBLISHED`: Automatically determined based on your deployment context

No additional configuration is needed - the monitoring is automatically enabled when running in production.

### How It Works

The server is wrapped with Sentry monitoring using:

```typescript
const monitoredServer = wrapMcpServerWithSentry(server)
```

This follows the exact pattern mentioned in the Sentry blog post and provides:

- Protocol-aware visibility into MCP server usage
- Performance monitoring for tool calls and resources
- Error tracking with proper context
- Client and transport segmentation

### Future Enhancements

When Sentry's official MCP server monitoring SDK becomes available, this integration will automatically provide:

- Detailed tracing of JSON-RPC requests
- Tool usage analytics
- Resource access patterns
- Performance insights
- Error correlation

For now, this serves as a foundation that follows the recommended pattern and will be enhanced as the official SDK becomes available.
