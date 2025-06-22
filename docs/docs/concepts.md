---
sidebar_position: 1
---

# Core Concepts

This section covers the fundamental concepts of dependency injection and NexusDI. For detailed explanations and examples, see the specific articles in each category.

## What is Dependency Injection?

Dependency Injection (DI) is a design pattern where dependencies are provided to a class from the outside, rather than the class creating them internally. This promotes loose coupling, testability, and maintainability.

For a comprehensive explanation of DI principles, patterns, and benefits, see **[Dependency Injection](./dependency-injection.md)**.

## Key Principles

### 1. Inversion of Control (IoC)

Instead of classes controlling their dependencies, dependencies are injected from outside:

```typescript
// Traditional approach
class UserService {
  private database = new PostgresDatabase(); // Class controls dependencies
}

// DI approach
@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(DATABASE) private database: IDatabase) {} // Dependencies injected
}
```

### 2. Dependency on Abstractions

Always depend on interfaces, not concrete implementations:

```typescript
// ✅ Good - depends on interface
interface IDatabase {
  query(sql: string, params: any[]): Promise<any>;
}

@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(DATABASE) private database: IDatabase) {} // Interface-based
}

// ❌ Bad - depends on concrete implementation
class UserService {
  constructor(private database: PostgresDatabase) {} // Concrete class
}
```

For detailed explanations of why interfaces and tokens are better, see **[Dependency Injection](./dependency-injection.md)**.

## Core Components

### Tokens

Tokens are unique identifiers for dependencies with type safety:

```typescript
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDatabase>('DATABASE');
```

For a complete guide to tokens, see **[Tokens](./tokens.md)**.

### Providers

Providers define how dependencies are created:

```typescript
// Class provider
nexus.set(USER_SERVICE, { useClass: UserService });

// Value provider
nexus.set(LOGGER, { useValue: new ConsoleLogger() });

// Factory provider
nexus.set(DATABASE, {
  useFactory: (config: IConfig) => new Database(config),
  deps: [CONFIG]
});
```

### Services

Services are classes that can be injected with dependencies:

```typescript
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

## Benefits of DI

- **Loose coupling**: Dependencies are abstracted through interfaces
- **Easy testing**: Simple to mock dependencies
- **Flexible configuration**: Easy to switch implementations
- **Modular architecture**: Easy to compose and reuse components
- **Environment-specific setups**: Different configs for dev/staging/prod

## When to Use DI

Use Dependency Injection when you have:
- Complex applications with many dependencies
- High testing requirements
- Multiple environments (dev/staging/prod)
- Team development with multiple developers
- Long-term maintenance needs

For simple applications or quick prototypes, regular imports may be more appropriate.

For a detailed comparison of DI vs regular imports, see **[DI vs Regular Imports](./di-vs-imports.md)**.

## Next Steps

- **[Dependency Injection](./dependency-injection.md)** - Detailed explanation of DI principles
- **[Tokens](./tokens.md)** - Complete guide to tokens
- **[DI vs Regular Imports](./di-vs-imports.md)** - When to use each approach
- **[Best Practices](./best-practices.md)** - Guidelines for maintainable DI code 