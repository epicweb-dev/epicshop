# Debug Logging

Epic Workshop App includes a built-in debug logging system based on Node.js's `debuglog` utility. This allows you to enable detailed logging for API interactions and other operations using environment variables.

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

To see debug output, set the `NODE_DEBUG` environment variable with the namespace pattern:

```bash
# Enable all epic:api logging
NODE_DEBUG=epic:api npm run dev

# Enable all epic logging (if you have multiple epic namespaces)
NODE_DEBUG=epic:* npm run dev

# Enable multiple specific namespaces
NODE_DEBUG=epic:api,other-namespace npm run dev
```

### Log Levels

The logger supports different log levels with emoji prefixes for visual distinction:

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

Enable epic:api logging to see detailed information about API interactions:

```bash
NODE_DEBUG=epic:api npm run dev
```

This will show logs for all `epic:api` operations including:
- API requests and responses
- Cache operations
- Error conditions with stack traces
- Performance timing information

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

The logger is built on top of Node.js's built-in `debuglog` utility, which provides:

- Conditional logging based on environment variables
- Zero performance impact when logging is disabled
- Automatic formatting and output handling
- Namespace-based filtering

The logger extends the base `debuglog` functionality with additional methods for different log levels while maintaining the same performance characteristics.