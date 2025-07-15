# Testing Guide for Workshop Utils

This guide covers the testing setup and best practices for the workshop-utils package.

## Test Setup

We use [Vitest](https://vitest.dev/) as our testing framework, which provides:

- ⚡ Fast test execution with Vite
- 🔄 Hot module reloading in watch mode
- 📊 Built-in coverage reporting
- 🎯 TypeScript support out of the box
- 🖥️ Browser-like environment

## Available Scripts

```bash
# Run tests once
npm run test:run

# Run tests in watch mode (recommended for development)
npm run test:watch

# Run tests with UI (opens browser interface)
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run basic tests (alias for watch mode)
npm run test
```

## Test Structure

Tests are co-located with source files using the `.test.ts` extension:

```
src/
├── utils.ts
├── utils.test.ts          # Tests for utils.ts
├── utils.server.ts
├── utils.server.test.ts   # Tests for utils.server.ts
└── ...
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest'
import { functionToTest } from './your-module.js'

describe('functionToTest', () => {
  it('should do something expected', () => {
    const result = functionToTest('input')
    expect(result).toBe('expected output')
  })
})
```

### Mocking

Use Vitest's built-in mocking capabilities:

```typescript
import { vi } from 'vitest'

// Mock a function
const mockFn = vi.fn()

// Mock a module
vi.mock('./external-module.js', () => ({
  default: vi.fn(),
  namedExport: vi.fn()
}))

// Mock global objects
global.fetch = vi.fn()
```

### Async Testing

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBe('expected')
})
```

### Error Testing

```typescript
it('should throw error for invalid input', () => {
  expect(() => {
    functionThatShouldThrow('invalid')
  }).toThrow('Expected error message')
})
```

## Coverage

Coverage is configured to use V8 provider and generates reports in multiple formats:

- **Text**: Console output during test run
- **HTML**: Interactive coverage report in `coverage/` directory
- **JSON**: Machine-readable coverage data

### Coverage Thresholds

Current coverage excludes:
- `node_modules/`
- `dist/`
- Configuration files (`*.config.*`)
- Type definitions (`*.d.ts`)

## CI/CD Integration

Tests run automatically in GitHub Actions:

1. **Unit Tests**: Run on every push and PR
2. **Coverage**: Generated and uploaded to Codecov
3. **Multiple Environments**: Tests run on Node.js 24

## Best Practices

### 1. Test Structure

Use descriptive test names that explain the scenario:

```typescript
describe('getErrorMessage', () => {
  it('should return the error message when error is a string', () => {
    // Test implementation
  })
  
  it('should return "Unknown Error" when error is null', () => {
    // Test implementation
  })
})
```

### 2. Arrange-Act-Assert Pattern

```typescript
it('should format user data correctly', () => {
  // Arrange
  const userData = { name: 'John', age: 30 }
  
  // Act
  const result = formatUser(userData)
  
  // Assert
  expect(result).toBe('John (30 years old)')
})
```

### 3. Mock External Dependencies

```typescript
describe('checkConnection', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })
  
  it('should return true when connection is successful', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true })
    
    const result = await checkConnection()
    
    expect(result).toBe(true)
  })
})
```

### 4. Test Edge Cases

Always test:
- Happy path
- Error conditions
- Edge cases (null, undefined, empty strings)
- Boundary conditions

### 5. Keep Tests Simple

Each test should focus on one specific behavior:

```typescript
// Good: Tests one specific case
it('should return empty array when no items provided', () => {
  expect(processItems([])).toEqual([])
})

// Avoid: Testing multiple scenarios in one test
it('should handle all cases', () => {
  // Multiple assertions testing different scenarios
})
```

## Debugging Tests

### Using VS Code

1. Install the [Vitest extension](https://marketplace.visualstudio.com/items?itemName=vitest.explorer)
2. Use the test explorer to run/debug individual tests
3. Set breakpoints in test files

### Using Browser UI

```bash
npm run test:ui
```

Opens an interactive browser interface where you can:
- Run individual tests
- See test results in real-time
- Inspect test coverage
- Debug failing tests

## Common Testing Patterns

### Testing Utilities

```typescript
// Test pure functions
describe('utility function', () => {
  it('should transform input correctly', () => {
    expect(utilityFunction(input)).toBe(expectedOutput)
  })
})
```

### Testing Error Handling

```typescript
// Test error scenarios
describe('error handling', () => {
  it('should handle network errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))
    
    const result = await functionThatMayFail()
    
    expect(result).toBe(fallbackValue)
  })
})
```

### Testing with Timers

```typescript
// Test time-dependent code
describe('time-based functionality', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  it('should execute after delay', () => {
    const callback = vi.fn()
    delayedFunction(callback, 1000)
    
    vi.advanceTimersByTime(1000)
    
    expect(callback).toHaveBeenCalled()
  })
})
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure you're using `.js` extensions in imports
2. **Mock Not Working**: Clear mocks between tests with `vi.clearAllMocks()`
3. **Async Issues**: Don't forget to `await` async functions in tests
4. **Type Errors**: Use proper TypeScript types for mocked functions

### Getting Help

- [Vitest Documentation](https://vitest.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Testing Best Practices](https://vitest.dev/guide/testing-best-practices.html)

---

Happy testing! 🧪