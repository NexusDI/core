---
sidebar_position: 3
---

# Tokens

## Understanding Tokens

Tokens are the foundation of NexusDI's dependency injection system. They act as unique identifiers for dependencies and provide type safety through TypeScript generics.

## Creating Tokens

```typescript
import { Token } from '@nexusdi/core';

// Basic token creation
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDatabase>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');
```

## Token Best Practices

### 1. Use Descriptive Names

```typescript
// ✅ Good - descriptive names
export const USER_REPOSITORY = new Token<IUserRepository>('USER_REPOSITORY');
export const EMAIL_SERVICE = new Token<IEmailService>('EMAIL_SERVICE');
export const PAYMENT_GATEWAY = new Token<IPaymentGateway>('PAYMENT_GATEWAY');

// ❌ Bad - generic names
export const SERVICE = new Token<any>('SERVICE');
export const DB = new Token<any>('DB');
```

### 2. Group Related Tokens

```typescript
// tokens/user.tokens.ts
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const USER_REPOSITORY = new Token<IUserRepository>('USER_REPOSITORY');
export const USER_VALIDATOR = new Token<IUserValidator>('USER_VALIDATOR');

// tokens/database.tokens.ts
export const DATABASE = new Token<IDatabase>('DATABASE');
export const DATABASE_CONFIG = new Token<IDatabaseConfig>('DATABASE_CONFIG');
export const DATABASE_CONNECTION = new Token<IDatabaseConnection>('DATABASE_CONNECTION');
```

### 3. Use Strong Typing

```typescript
// ✅ Good - strong typing
interface IUserService {
  getUser(id: string): Promise<User>;
  createUser(user: CreateUserDto): Promise<User>;
  updateUser(id: string, user: UpdateUserDto): Promise<User>;
}

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

// ❌ Bad - weak typing
export const USER_SERVICE = new Token<any>('USER_SERVICE');
```

## Working with Providers

For detailed information about how tokens work with providers, different provider types, and registration patterns, see **[Providers and Services](./providers-and-services.md)**.

## Token Resolution

### Basic Resolution

```typescript
// Resolve a service
const userService = nexus.get(USER_SERVICE);

// Resolve with type assertion
const userService = nexus.get(USER_SERVICE) as IUserService;
```

### Safe Resolution

```typescript
// Check if token is registered
if (nexus.has(USER_SERVICE)) {
  const userService = nexus.get(USER_SERVICE);
}

// Get with fallback
const logger = nexus.get(LOGGER) || new ConsoleLogger();
```

### Resolution Order

NexusDI resolves dependencies in the following order:

1. **Singleton instances** (cached)
2. **Factory functions** (with dependencies)
3. **Class instantiation** (with dependency injection)
4. **Async factory functions** (with dependencies)

## Advanced Token Patterns

### 1. Token Aliases

```typescript
// Create aliases for the same service
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const USER_REPOSITORY = new Token<IUserService>('USER_REPOSITORY'); // Alias

// Register once, resolve with either token
nexus.set(USER_SERVICE, { useClass: UserService });
nexus.set(USER_REPOSITORY, { useClass: UserService }); // Same implementation
```

### 2. Token Composition

```typescript
// Compose tokens for complex scenarios
export const DATABASE_CONFIG = new Token<IDatabaseConfig>('DATABASE_CONFIG');
export const DATABASE_CONNECTION = new Token<IDatabaseConnection>('DATABASE_CONNECTION');
export const DATABASE = new Token<IDatabase>('DATABASE');

// Register in dependency order
nexus.set(DATABASE_CONFIG, { useValue: { host: 'localhost', port: 5432 } });
nexus.set(DATABASE_CONNECTION, { 
  useFactory: (config: IDatabaseConfig) => new DatabaseConnection(config),
  deps: [DATABASE_CONFIG]
});
nexus.set(DATABASE, {
  useFactory: (connection: IDatabaseConnection) => new Database(connection),
  deps: [DATABASE_CONNECTION]
});
```

### 3. Token Validation

```typescript
// Validate token registration
function validateTokens(nexus: Nexus, requiredTokens: Token<any>[]) {
  const missing = requiredTokens.filter(token => !nexus.has(token));
  
  if (missing.length > 0) {
    throw new Error(`Missing required tokens: ${missing.map(t => t.toString()).join(', ')}`);
  }
}

// Usage
validateTokens(nexus, [USER_SERVICE, DATABASE, LOGGER]);
```

## Summary

Tokens are the core identifiers in NexusDI's dependency injection system:

- **Tokens** provide type-safe identifiers for dependencies
- **Strong typing** ensures compile-time safety
- **Descriptive naming** improves code readability
- **Token composition** enables complex dependency scenarios
- **Validation patterns** help catch configuration errors

Understanding tokens is essential for building maintainable, testable applications with NexusDI. For information about how tokens work with providers, see **[Providers and Services](./providers-and-services.md)**. 