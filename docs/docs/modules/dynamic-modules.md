---
sidebar_position: 4
---

# Dynamic Modules

Dynamic modules allow you to configure modules at runtime with different settings for different environments or use cases.

## Overview

Dynamic modules enable:

- **Environment-specific configuration** (dev, staging, prod)
- **Feature-based configuration** (different providers, settings)
- **Runtime configuration** (user preferences, A/B testing)
- **Validation** of configuration at registration time

## New Pattern: Type-Safe Dynamic Module Configuration

> **As of v0.4.0+, module authors define their own static `config`/`configAsync` methods using the provided helper `createModuleConfig`.**
> This gives consumers full type inference and strict errors, with no need for generics or helpers at the call site. **You only need `createModuleConfig` for both sync and async configuration.**

### How It Works

1. **Module authors** define static `config`/`configAsync` methods using the single helper from `@nexusdi/core`:

```typescript
import { Module, Token, createModuleConfig } from '@nexusdi/core';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
}

const DATABASE_CONFIG = Token('DATABASE_CONFIG');

@Module({ providers: [DatabaseService] })
export class DatabaseModule {
  static configToken = DATABASE_CONFIG;

  static config(config: DatabaseConfig | ProviderConfigObject<DatabaseConfig>) {
    // Optionally validate config here
    return createModuleConfig(DatabaseModule, config);
  }

  static configAsync(
    config:
      | Promise<DatabaseConfig>
      | ProviderConfigObject<Promise<DatabaseConfig>>
  ) {
    // Optionally validate config here (after resolving if needed)
    return createModuleConfig(DatabaseModule, config);
  }
}
```

2. **Consumers** get full type inference and strict errors:

```typescript
const container = new Nexus();

// Synchronous configuration
container.set(
  DatabaseModule.config({
    host: 'localhost',
    port: 5432,
    database: 'myapp',
  })
);

// Asynchronous configuration
const config = await DatabaseModule.configAsync(
  Promise.resolve({
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    database: process.env.DB_NAME!,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
  })
);
container.set(config);
```

- **Type errors** are shown for missing, extra, or wrong-typed properties.
- No need for generics or helper functions at the call site.
- **Note:** The return type of `createModuleConfig` (and thus your static config methods) is `ModuleConfig` for sync input, or `Promise<ModuleConfig>` for async input.

---

## Environment-Specific Modules

You can still use separate modules for different environments if you prefer:

```typescript
@Module({
  providers: [
    DatabaseService,
    {
      token: DATABASE_CONFIG,
      useValue: {
        host: 'localhost',
        port: 5432,
        database: 'dev_db',
      },
    },
  ],
})
class DevelopmentDatabaseModule {}

@Module({
  providers: [
    DatabaseService,
    {
      token: DATABASE_CONFIG,
      useValue: {
        host: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT!),
        database: process.env.DB_NAME!,
      },
    },
  ],
})
class ProductionDatabaseModule {}

const container = new Nexus();
if (process.env.NODE_ENV === 'production') {
  container.set(ProductionDatabaseModule);
} else {
  container.set(DevelopmentDatabaseModule);
}
```

---

## Feature-Based and Composite Configuration

You can use the same pattern for feature-based or composite configuration:

```typescript
interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun';
  apiKey?: string;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
  };
}

const EMAIL_CONFIG = Symbol('EMAIL_CONFIG');

@Module({ providers: [EmailService] })
export class EmailModule {
  static configToken = EMAIL_CONFIG;
  static config(config: EmailConfig | ProviderConfigObject<EmailConfig>) {
    return createModuleConfig(EmailModule, config);
  }
}

// Usage
const container = new Nexus();
if (process.env.EMAIL_PROVIDER === 'sendgrid') {
  container.set(
    EmailModule.config({
      provider: 'sendgrid',
      apiKey: process.env.SENDGRID_API_KEY,
    })
  );
} else if (process.env.EMAIL_PROVIDER === 'mailgun') {
  container.set(
    EmailModule.config({
      provider: 'mailgun',
      apiKey: process.env.MAILGUN_API_KEY,
    })
  );
} else {
  container.set(
    EmailModule.config({
      provider: 'smtp',
      smtpConfig: {
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT!),
        secure: process.env.SMTP_SECURE === 'true',
      },
    })
  );
}
```

---

## Composite Modules

```typescript
@Module({ providers: [AppService] })
export class AppModule {
  static configToken = Symbol('APP_CONFIG');
  static config(config: {
    database: DatabaseConfig;
    email: EmailConfig;
    logging: LogConfig;
  }) {
    return createModuleConfig(AppModule, config);
  }
}

const container = new Nexus();
container.set(
  AppModule.config({
    database: { host: 'localhost', port: 5432, database: 'myapp' },
    email: { provider: 'sendgrid', apiKey: process.env.SENDGRID_API_KEY },
    logging: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })
);
```

---

## Configuration Validation

You can add validation logic in your static config method before calling the helper:

```typescript
@Module({ providers: [DatabaseService] })
export class DatabaseModule {
  static configToken = Symbol('DATABASE_CONFIG');
  static config(config: DatabaseConfig) {
    if (!config.host) throw new Error('Database host is required');
    if (!config.port || config.port < 1 || config.port > 65535)
      throw new Error('Database port must be between 1 and 65535');
    if (!config.database) throw new Error('Database name is required');
    return createModuleConfig(DatabaseModule, config);
  }
}
```

---

## Testing with Dynamic Modules

You can test modules with different configurations by calling the static config method:

```typescript
describe('DatabaseModule', () => {
  it('should work with test configuration', () => {
    const container = new Nexus();
    container.set(
      DatabaseModule.config({
        host: 'localhost',
        port: 5432,
        database: 'test_db',
      })
    );
    const databaseService = container.get(DATABASE_SERVICE);
    expect(databaseService).toBeInstanceOf(DatabaseService);
  });

  it('should validate configuration', () => {
    expect(() => {
      const container = new Nexus();
      container.set(
        DatabaseModule.config({
          host: '', // Invalid
          port: 5432,
          database: 'test_db',
        })
      );
    }).toThrow('Database host is required');
  });
});
```

---

## Async Dynamic Module Registration

Sometimes, your modules need to fetch secrets, load configs, or call APIs before they're ready to join the party. That's where `configAsync()` comes in!

```typescript
// Correct: Wait for the config to finish before registering
const config = await MyModule.configAsync(options);
container.set(config);

// ❌ Don't do this! (You'll hand the chef a recipe that's still in the oven)
container.set(MyModule.configAsync(options)); // Not supported
```

> **Heads up:** Always `await` the result of `configAsync()` before passing it to `set`. The container expects a fully-baked config, not a promise.

---

## Rationale & Benefits

- **Type safety for consumers**: No need for generics or helpers at the call site; errors are caught at compile time.
- **Low boilerplate for module authors**: Just call the helper in your static method.
- **Consistent logic**: All modules use the same config creation logic, reducing bugs and copy-paste errors.
- **Extensible**: You can add validation, async config, and more advanced patterns as needed.

---

## Next Steps

- **[Module Basics](module-basics.md)** - Learn the fundamentals of modules
- **[Module Patterns](module-patterns.md)** - Explore common module patterns
- **[Advanced Providers & Factories](advanced/advanced-providers-and-factories.md)** - Advanced provider configuration

Dynamic modules will provide powerful runtime configuration capabilities in future releases! 🚀
