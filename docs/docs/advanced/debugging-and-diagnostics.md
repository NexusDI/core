---
sidebar_position: 8
---

# Debugging & Diagnostics 🔍

Quick debugging tips and techniques to get you unstuck when dependency injection issues arise. When things go sideways, these simple workarounds can save you hours of troubleshooting.

> See also: [Testing](../testing.md), [Circular Dependencies](circular-dependencies.md)

## Quick Debugging Checklist

### ✅ Common Issues & Solutions

- **Missing provider**: Check if the service is registered with `container.has(token)`
- **Type mismatches**: Use TypeScript types to catch injection errors at compile time
- **Circular dependencies**: Look for services that depend on each other
- **Module registration**: Ensure all required modules are registered

### ❌ Common Mistakes

- Forgetting to register providers before using them
- Using wrong token types or names
- Not handling async factory functions properly
- Ignoring TypeScript compilation errors

## Basic Debugging Techniques

### Check Container State

```typescript
// Inspect what's registered
const { providers, modules } = container.list();
console.log('Registered providers:', providers);
console.log('Registered modules:', modules);

// Check specific providers
console.log('Has USER_SERVICE:', container.has(USER_SERVICE));
```

### Error Handling

```typescript
// Handle missing dependencies gracefully
try {
  const userService = container.get(USER_SERVICE);
} catch (error) {
  console.error('Failed to resolve USER_SERVICE:', error);
  // Fallback or error handling
}
```

### TypeScript Compile-Time Checking

```typescript
// ✅ Good - Type-safe resolution
const userService = container.get<UserService>(USER_SERVICE);
const database = container.get<IDatabase>(DATABASE);

// ❌ Bad - No type checking
const userService = container.get(USER_SERVICE); // No type safety
```

## Common Debugging Scenarios

### Scenario 1: Missing Provider

```typescript
// Error: "No provider found for token: USER_SERVICE"

// Debug steps:
console.log('Checking container state...');
const { providers } = container.list();
console.log('Registered providers:', providers);

// Check if the token is registered
console.log('Has USER_SERVICE:', container.has(USER_SERVICE));

// Solution: Register the missing provider
container.set(USER_SERVICE, { useClass: UserService });
```

### Scenario 2: Circular Dependency

```typescript
// Error: "Circular dependency detected"

// Look for services that depend on each other
@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(EMAIL_SERVICE) private email: IEmailService) {}
}

@Service(EMAIL_SERVICE)
class EmailService {
  constructor(@Inject(USER_SERVICE) private user: IUserService) {} // Circular!
}

// Solution: Refactor to remove the cycle
@Service(EMAIL_SERVICE)
class EmailService {
  constructor(@Inject(LOGGER) private logger: ILogger) {} // No circular dependency
}
```

### Scenario 3: Type Mismatch

```typescript
// Error: "Type 'DatabaseService' is not assignable to type 'IDatabase'"

// Check if the service implements the interface
console.log(
  'DatabaseService implements IDatabase:',
  'query' in new DatabaseService()
);

// Solution: Ensure proper interface implementation
class DatabaseService implements IDatabase {
  query(sql: string): Promise<any> {
    // Implementation
  }
}
```

## Debug Factory Functions

```typescript
// Add logging to factory functions
container.set(USER_SERVICE, {
  useFactory: () => {
    console.log('🔧 Creating UserService...');

    try {
      const database = container.get(DATABASE);
      const logger = container.get(LOGGER);
      const userService = new UserService(database, logger);
      console.log('✅ UserService created successfully');
      return userService;
    } catch (error) {
      console.error('❌ Failed to create UserService:', error);
      throw error;
    }
  },
});
```

## Debug Test Setup

```typescript
describe('UserService Integration', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();

    // Register dependencies with debugging
    try {
      container.set(DATABASE, { useClass: MockDatabase });
      container.set(LOGGER, { useClass: MockLogger });
      container.set(USER_SERVICE, { useClass: UserService });
    } catch (error) {
      console.error('❌ Failed to register dependencies:', error);
      throw error;
    }
  });

  it('should resolve UserService with dependencies', () => {
    try {
      const userService = container.get(USER_SERVICE);
      expect(userService).toBeInstanceOf(UserService);
    } catch (error) {
      console.error('❌ UserService resolution failed:', error);
      throw error;
    }
  });
});
```

## Environment-Specific Debugging

```typescript
// Only enable debugging in development
if (process.env.NODE_ENV === 'development') {
  // Enable detailed logging
  container.set(DEBUG_MODE, { useValue: true });

  // Add debug logging
  container.set(LOGGER, {
    useFactory: () => new DebugLogger(),
  });
} else {
  // Production: minimal logging
  container.set(LOGGER, {
    useFactory: () => new ProductionLogger(),
  });
}
```

## Debugging Checklist

When troubleshooting DI issues:

- [ ] **Check TypeScript compilation** - Look for type errors
- [ ] **Verify provider registration** - Use `container.has()` and `container.list()`
- [ ] **Inspect dependency graph** - Look for circular dependencies
- [ ] **Test resolution manually** - Try `container.get()` in isolation
- [ ] **Check module imports** - Ensure all required modules are registered
- [ ] **Review error messages** - NexusDI provides detailed error information

## Next Steps

- **[Testing](../testing.md)** - How to test with the container
- **[Circular Dependencies](circular-dependencies.md)** - Handle circular dependency issues
- **[Debugging Utilities](debugging-utilities.md)** - Advanced debugging tools and utilities

Remember: Good debugging is like being a detective - follow the clues, check your assumptions, and don't be afraid to add some logging to see what's really happening! 🔍✨
