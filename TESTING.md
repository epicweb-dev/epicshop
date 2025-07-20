# Testing Guide

This guide covers the testing setup and best practices for the Epic Workshop project.

## Overview

The project uses a multi-layered testing approach:

- **Unit Tests**: Vitest for individual package testing
- **Integration Tests**: Cross-package functionality testing
- **End-to-End Tests**: Playwright for full application testing

## Test Structure

### Unit Tests (Vitest)

Each package has its own test configuration:

```
packages/
├── workshop-utils/
│   ├── src/
│   │   ├── utils.test.ts
│   │   └── test-helpers.ts
│   ├── vitest.config.ts
│   └── vitest.setup.ts
├── workshop-presence/
│   ├── src/
│   │   └── presence.test.ts
│   ├── vitest.config.ts
│   └── vitest.setup.ts
└── ...
```

### End-to-End Tests (Playwright)

```
tests/
├── smoke.spec.ts
├── global-setup.ts
├── global-teardown.ts
└── tsconfig.json
```

## Running Tests

### All Tests
```bash
npm test                    # Run all unit tests
npm run test:no-watch      # Run tests without watch mode
npm run test:e2e           # Run end-to-end tests
```

### Individual Packages
```bash
cd packages/workshop-utils
npm test                   # Run tests for specific package
```

### With Coverage
```bash
npm test -- --coverage    # Run with coverage report
```

## Test Configuration Features

### Enhanced Reliability
- **Automatic retries**: Tests retry 2 times on failure
- **Proper isolation**: Each test runs in its own process fork
- **Timeout management**: Configurable timeouts for different test types
- **Mock cleanup**: Automatic cleanup of mocks between tests

### Coverage Reporting
- **V8 provider**: Fast and accurate coverage
- **Multiple formats**: Text, JSON, and HTML reports
- **Coverage thresholds**: 70% minimum coverage requirement
- **Exclusions**: Properly excludes test files and build artifacts

### Console Management
- **Mock console**: Prevents test output noise
- **Error capture**: Captures and validates console errors
- **Cleanup**: Automatic restoration of console methods

## Best Practices

### Test Structure
```typescript
import { test, expect, describe } from 'vitest'

describe('Feature Name', () => {
  test('should handle normal case', () => {
    // Arrange
    const input = 'test input'
    
    // Act
    const result = functionUnderTest(input)
    
    // Assert
    expect(result).toBe('expected output')
  })
  
  test('should handle error case', () => {
    expect(() => functionUnderTest(null)).toThrow('Expected error message')
  })
})
```

### Using Test Helpers
```typescript
import { createTestEnvironment, expectToThrow } from '../test-helpers'

test('should handle async operations', async () => {
  const env = createTestEnvironment()
  
  try {
    // Your test code here
    await expectToThrow(
      () => asyncFunction(),
      'Expected error message'
    )
  } finally {
    env.cleanup()
  }
})
```

### Error Testing
```typescript
import { createTestError } from '../test-helpers'

test('should handle different error types', async () => {
  // Test network errors
  const networkError = createTestError.network()
  
  // Test validation errors
  const validationError = createTestError.validation()
  
  // Test custom errors
  const customError = createTestError.withCode('Custom message', 'CUSTOM_CODE')
})
```

## Troubleshooting

### Common Issues

#### Import Resolution Errors
If you see import resolution errors:
1. Check that the imported module exists
2. Verify the module exports the expected functions
3. Ensure the module is built (run `npm run build`)

#### Test Timeouts
If tests are timing out:
1. Increase the timeout in `vitest.config.ts`
2. Check for infinite loops or hanging promises
3. Use `vi.useFakeTimers()` for timer-dependent code

#### Flaky Tests
If tests are inconsistent:
1. Use proper async/await patterns
2. Clean up resources in `afterEach` hooks
3. Avoid shared state between tests
4. Use deterministic test data

#### E2E Test Failures
If Playwright tests fail:
1. Check that the web server is running
2. Verify the correct port configuration
3. Ensure all dependencies are installed
4. Check browser compatibility

### Debugging Tests

#### Verbose Output
```bash
npm test -- --reporter=verbose
```

#### Debug Mode
```bash
npm test -- --inspect-brk
```

#### Playwright Debug
```bash
npx playwright test --debug
```

## Test Patterns

### Async Testing
```typescript
test('should handle async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBeDefined()
})
```

### Mock Functions
```typescript
test('should call dependency', () => {
  const mockFn = vi.fn()
  functionUnderTest(mockFn)
  expect(mockFn).toHaveBeenCalledWith('expected argument')
})
```

### Error Boundaries
```typescript
test('should handle errors gracefully', async () => {
  const consoleSpy = vi.spyOn(console, 'error')
  
  await functionThatLogsErrors()
  
  expect(consoleSpy).toHaveBeenCalledWith(
    expect.stringContaining('error message')
  )
})
```

### Time-based Testing
```typescript
test('should handle timeouts', async () => {
  vi.useFakeTimers()
  
  const promise = functionWithTimeout()
  vi.advanceTimersByTime(5000)
  
  await expect(promise).resolves.toBe('timeout result')
  
  vi.useRealTimers()
})
```

## Continuous Integration

### GitHub Actions
Tests run automatically on:
- Pull requests
- Push to main branch
- Scheduled runs (daily)

### Test Reports
- Coverage reports are generated and stored
- Failed tests include screenshots and traces
- Performance metrics are tracked

## Contributing

When adding new tests:

1. **Follow naming conventions**: `*.test.ts` for unit tests, `*.spec.ts` for E2E tests
2. **Add appropriate descriptions**: Use descriptive test names
3. **Include edge cases**: Test both success and failure scenarios
4. **Maintain coverage**: Ensure new code has adequate test coverage
5. **Update documentation**: Update this guide for new patterns or tools

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Mock Patterns](https://vitest.dev/guide/mocking.html)