# Debug Logging

Epic Workshop App includes a built-in debug logging system based on Node.js's
`debuglog` utility. This allows you to enable detailed logging for API
interactions and other operations using environment variables.

## Usage

### Basic Logging

The logger utility provides a simple interface for debug logging:

```typescript
import { logger } from '@epic-web/workshop-utils/logger'

const log = logger('epic:api')
log('Processing request')
log.error('API request failed:', error)
log.warn('Deprecated endpoint used')
log.info('Successfully processed data')
```

### Enabling Debug Output

To see debug output, set the `NODE_DEBUG` environment variable with the
namespace pattern:

```bash
# Enable all epic:api logging
NODE_DEBUG=epic:api npm run dev

# Enable all epic logging (if you have multiple epic namespaces)
NODE_DEBUG=epic:* npm run dev

# Enable multiple specific namespaces
NODE_DEBUG=epic:api,other-namespace npm run dev
```

### Log Levels

The logger supports different log levels with emoji prefixes for visual
distinction:

- `log('message')` - Standard debug logging (no emoji)
- `log.error('message')` - Error logging with 🚨 prefix
- `log.warn('message')` - Warning logging with ⚠️ prefix
- `log.info('message')` - Info logging with ℹ️ prefix

### API Debugging

The `epic:api` utilities automatically include debug logging for:

- Video information fetching
- User progress tracking
- Workshop data retrieval
- API response parsing
- Error handling

Enable `epic:api` logging to see detailed information about API interactions:

```bash
NODE_DEBUG=epic:api npm run dev
```

This will show logs for all `epic:api` operations including:

- API requests and responses
- Cache operations
- Error conditions with stack traces
- Performance timing information

### Offline Video Downloads

Use the `epic:offline-videos` namespace to diagnose offline video downloads:

```bash
NODE_DEBUG=epic:offline-videos npm run dev
```

This will show logs for:

- Offline video download requests
- Mux URL attempts and failures
- Successful download sizes
- Error details when downloads fail

### Cache Debugging

The workshop app includes integrated cache logging that shows detailed cache
operations:

```bash
NODE_DEBUG=epic:cache:* npm run dev
```

This will show logs for all cache operations including:

- Cache hits and misses
- Fresh value generation timing
- Cache errors and recovery
- Background refresh operations

You can also enable logging for specific caches:

```bash
# Enable logging for ExampleAppCache only
NODE_DEBUG=epic:cache:exampleappcache npm run dev

# Enable logging for LRU caches
NODE_DEBUG=epic:cache:lru npm run dev
```

### Request Debugging

To see detailed request logging, enable the `epic:req` namespace:

```bash
NODE_DEBUG=epic:req npm run dev
```

### Authentication Debugging

The authentication system includes comprehensive logging for OAuth device flow
operations:

```bash
NODE_DEBUG=epic:auth npm run dev
```

This will show logs for all authentication operations including:

- Device registration process initiation
- OAuth configuration discovery
- Device authorization initiation with user codes
- Token polling and grant reception
- User info fetching from protected resources
- Database auth info storage
- Error conditions and timeouts
- Authentication completion status

Enable `epic:auth` logging to troubleshoot authentication issues:

```bash
NODE_DEBUG=epic:auth npm run dev
```

This will show detailed information about:

- OAuth issuer configuration
- Device authorization flow progress
- Token set validation
- User info parsing and validation
- Database operations for auth storage
- API calls for fresh user data

### Custom Logging

You can create your own debug loggers for custom functionality:

```typescript
import { logger } from '@epic-web/workshop-utils/logger'

const log = logger('epic:custom-feature')

// Enable with:
// NODE_DEBUG=epic:custom-feature npm run dev
log('Custom feature executed')
log.error('Custom feature failed:', error)
```

## Implementation

The logger is built on top of Node.js's built-in `debuglog` utility, which
provides:

- Conditional logging based on environment variables
- Zero performance impact when logging is disabled
- Automatic formatting and output handling
- Namespace-based filtering

The logger extends the base `debuglog` functionality with additional methods for
different log levels while maintaining the same performance characteristics.
