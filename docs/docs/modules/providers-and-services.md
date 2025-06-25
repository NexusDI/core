---
sidebar_position: 4
---

# Providers and Services

This article explains how providers and services work in NexusDI, what can be injected, and why the `deps` parameter is needed for factory providers. Think of providers as the different ways you can summon your dependencies - sometimes you conjure them from thin air, sometimes you need to build them step by step.

## What Can Be Injected?

NexusDI can inject any registered dependency, including:

- **Services** - Classes decorated with `@Service`
- **Values** - Simple values, objects, or existing instances
- **Factories** - Functions that create instances
- **Async Factories** - Functions that create instances asynchronously
- **Configuration** - Settings, environment variables, or config objects

## Provider Types

NexusDI supports multiple provider types to handle different dependency scenarios.

### 1. Class Providers

Use when you want to register a class that should be instantiated by the container:

```typescript
import { Nexus, Token, Service, Inject } from '@nexusdi/core';

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDatabase>('DATABASE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDatabase) {}

  async getUser(id: string): Promise<User> {
    return this.database.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

@Service(DATABASE)
class PostgresDatabase implements IDatabase {
  async query(sql: string, params: any[]): Promise<any> {
    // PostgreSQL implementation
  }
}

// Registration
const nexus = new Nexus();
nexus.set(USER_SERVICE, { useClass: UserService });
nexus.set(DATABASE, { useClass: PostgresDatabase });
```

### 2. Value Providers

Use when you want to register an existing instance or value:

```typescript
// Register existing instances
const logger = new ConsoleLogger();
nexus.set(LOGGER, { useValue: logger });

// Register configuration objects
const config = {
  database: {
    host: 'localhost',
    port: 5432,
    name: 'myapp',
  },
};
nexus.set(CONFIG, { useValue: config });

// Register functions
const hashFunction = (password: string) => bcrypt.hash(password, 10);
nexus.set(HASH_FUNCTION, { useValue: hashFunction });
```

### 3. Factory Providers

Use when you need custom instantiation logic:

```typescript
// Simple factory
nexus.set(DATABASE, {
  useFactory: () => {
    const config = nexus.get(DATABASE_CONFIG);
    return new PostgresDatabase(config);
  },
});

// Factory with dependencies
nexus.set(EMAIL_SERVICE, {
  useFactory: (config: IEmailConfig, logger: ILogger) => {
    if (config.provider === 'sendgrid') {
      return new SendGridEmailService(config.apiKey, logger);
    } else {
      return new ConsoleEmailService(logger);
    }
  },
  deps: [EMAIL_CONFIG, LOGGER],
});
```

### 4. Async Factory Providers

Use when you need asynchronous initialization:

```typescript
nexus.set(DATABASE, {
  useFactoryAsync: async () => {
    const config = nexus.get(DATABASE_CONFIG);
    const connection = await createDatabaseConnection(config);
    return new PostgresDatabase(connection);
  },
});

// With dependencies
nexus.set(EMAIL_SERVICE, {
  useFactoryAsync: async (config: IEmailConfig, logger: ILogger) => {
    const client = await EmailClient.create(config);
    return new EmailService(client, logger);
  },
  deps: [EMAIL_CONFIG, LOGGER],
});
```

## Why Do Factory Providers Need `deps`?

Factory functions don't have the same automatic dependency injection that class constructors get with decorators. Here's why `deps` is needed:

### Without `deps` - Factory Functions Don't Know About Dependencies

```typescript
// ❌ This won't work - factory has no way to get dependencies
nexus.set(DATABASE, {
  useFactory: (config: IDatabaseConfig) => new Database(config),
});

// When you call nexus.get(DATABASE), the factory gets called with no arguments
// So config is undefined, and new Database(undefined) fails
```

### With `deps` - Factory Functions Get Their Dependencies

```typescript
// ✅ This works - factory gets dependencies injected
nexus.set(DATABASE_CONFIG, { useValue: { host: 'localhost', port: 5432 } });
nexus.set(DATABASE, {
  useFactory: (config: IDatabaseConfig) => new Database(config),
  deps: [DATABASE_CONFIG], // Tells NexusDI to inject DATABASE_CONFIG as first argument
});

// When you call nexus.get(DATABASE):
// 1. NexusDI sees the deps array
// 2. It resolves DATABASE_CONFIG first
// 3. It calls the factory with the resolved config: factory({ host: 'localhost', port: 5432 })
// 4. The factory creates and returns new Database({ host: 'localhost', port: 5432 })
```

### Why Classes Don't Need `deps`

Classes with `@Inject` decorators get automatic dependency injection:

```typescript
@Service(DATABASE)
class DatabaseService {
  constructor(@Inject(DATABASE_CONFIG) private config: IDatabaseConfig) {}
  // NexusDI automatically knows to inject DATABASE_CONFIG because of @Inject decorator
}

nexus.set(DATABASE, { useClass: DatabaseService });
// No deps needed - the decorator metadata tells NexusDI what to inject
```

## When You Need `deps`

You need `deps` when:

- **Using `useFactory`** - Factory functions don't have decorator metadata
- **Complex initialization** - When you need custom logic to create instances
- **Conditional creation** - When the instance depends on runtime conditions
- **Multiple dependencies** - When a factory needs several dependencies in a specific order

## When You Don't Need `deps`

You don't need `deps` when:

- **Using `useClass`** - Classes with `@Inject` decorators handle dependencies automatically
- **Using `useValue`** - Values are already resolved
- **Simple factories** - When the factory doesn't need any dependencies

## Real-World Examples

### Complex Service with Multiple Dependencies

```typescript
// Configuration
nexus.set(DATABASE_CONFIG, { useValue: { host: 'localhost', port: 5432 } });
nexus.set(LOGGER_CONFIG, { useValue: { level: 'info' } });

// Service that needs both configs
nexus.set(DATABASE_SERVICE, {
  useFactory: (dbConfig: IDatabaseConfig, loggerConfig: ILoggerConfig) => {
    const logger = new Logger(loggerConfig);
    return new DatabaseService(dbConfig, logger);
  },
  deps: [DATABASE_CONFIG, LOGGER_CONFIG], // Order matters - matches factory parameters
});
```

### Conditional Service Creation

```typescript
// Choose email provider based on configuration
nexus.set(EMAIL_SERVICE, {
  useFactory: (config: IEmailConfig, logger: ILogger) => {
    if (config.provider === 'sendgrid') {
      return new SendGridEmailService(config.apiKey, logger);
    } else if (config.provider === 'mailgun') {
      return new MailgunEmailService(config.apiKey, logger);
    } else {
      return new ConsoleEmailService(logger);
    }
  },
  deps: [EMAIL_CONFIG, LOGGER],
});
```

### Async Service with Dependencies

```typescript
// Database connection with async initialization
nexus.set(DATABASE_CONNECTION, {
  useFactoryAsync: async (config: IDatabaseConfig, logger: ILogger) => {
    logger.info('Connecting to database...');
    const connection = await createDatabaseConnection(config);
    logger.info('Database connected successfully');
    return connection;
  },
  deps: [DATABASE_CONFIG, LOGGER],
});
```

## Provider Registration Patterns

### Direct Registration

```typescript
// Register services directly
nexus.set(USER_SERVICE, { useClass: UserService });
nexus.set(DATABASE, { useClass: PostgresDatabase });
nexus.set(LOGGER, { useClass: ConsoleLogger });
```

### Module Registration

```typescript
// Register services through modules
const UserModule = {
  services: [UserService, UserRepository],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase },
    { token: LOGGER, useClass: ConsoleLogger },
  ],
};

nexus.set(UserModule);
```

### Conditional Registration

```typescript
// Register based on environment
if (process.env.NODE_ENV === 'production') {
  nexus.set(LOGGER, { useClass: StructuredLogger });
  nexus.set(DATABASE, { useClass: PostgresDatabase });
} else {
  nexus.set(LOGGER, { useClass: ConsoleLogger });
  nexus.set(DATABASE, { useClass: InMemoryDatabase });
}

// Register based on configuration
if (process.env.EMAIL_PROVIDER === 'sendgrid') {
  nexus.set(EMAIL_SERVICE, { useClass: SendGridEmailService });
} else {
  nexus.set(EMAIL_SERVICE, { useClass: ConsoleEmailService });
}
```

## Summary

The `deps` parameter essentially tells NexusDI: "When you call this factory function, inject these dependencies as arguments in this order."

Understanding when and why to use `deps` is crucial for working with factory providers in NexusDI. While classes with decorators get automatic dependency injection, factory functions need explicit dependency specification through the `deps` array.

For more information about tokens and how they work with providers, see **[Tokens](./tokens.md)**.

For advanced provider patterns, see [Advanced Providers & Factories](advanced/advanced-providers-and-factories.md).
For multi-injection and plugin systems, see [Multi-injection & Collections](advanced/multi-injection-and-collections.md).
For lifetimes and scoping, see [Scoped & Transient Lifetimes](advanced/scoped-and-transient-lifetimes.md).

## Next Steps

- **[Module Basics](./module-basics.md)** - How to organize services into modules
- **[Testing](./testing.md)** - How to test services and providers
- **[Advanced](./advanced.md)** - Advanced provider patterns and techniques
