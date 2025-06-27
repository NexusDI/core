---
sidebar_position: 4
---

# Dynamic Modules

Dynamic modules allow you to configure modules at runtime with different settings for different environments or use cases.

> **Note**: Dynamic module configuration patterns are planned for future releases. The current implementation supports basic module registration with `container.set()`.

## Overview

Dynamic modules enable:

- **Environment-specific configuration** (dev, staging, prod)
- **Feature-based configuration** (different providers, settings)
- **Runtime configuration** (user preferences, A/B testing)
- **Validation** of configuration at registration time

## Planned Implementation

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

Dynamic module configuration with `.config()` and `.configAsync()` methods is planned for future releases. This will allow runtime configuration of modules.

```typescript
// Planned API - Not yet implemented
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
}

@Module({
  providers: [DatabaseService, { token: DATABASE_CONFIG, useValue: {} }],
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
  protected readonly moduleConfig = {
    providers: [DatabaseService, { token: DATABASE_CONFIG, useValue: {} }],
  };
}

// Usage
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
container.set(
  DatabaseModule.configAsync(async () => ({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
  }))
);
```

</details>

## Current Implementation

For now, you can achieve similar functionality using the current module system:

### Environment-Specific Modules

```typescript
// Development module
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

// Production module
@Module({
  providers: [
    DatabaseService,
    {
      token: DATABASE_CONFIG,
      useValue: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
      },
    },
  ],
})
class ProductionDatabaseModule {}

// Usage
const container = new Nexus();

if (process.env.NODE_ENV === 'production') {
  container.set(ProductionDatabaseModule);
} else {
  container.set(DevelopmentDatabaseModule);
}
```

### Configuration Injection in Services

Services within the module can inject the configuration:

```typescript
@Service(DATABASE_SERVICE)
class DatabaseService {
  constructor(@Inject(DATABASE_CONFIG) private config: DatabaseConfig) {}

  async connect() {
    console.log(
      `Connecting to ${this.config.host}:${this.config.port}/${this.config.database}`
    );
    // Connection logic
  }
}
```

## Advanced Configuration Patterns

### Environment-Specific Configuration

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

This pattern will be supported with dynamic module configuration in future releases.

```typescript
@Module({
  providers: [LoggerService, { token: LOG_CONFIG, useValue: {} }],
})
class LoggingModule extends DynamicModule<LogConfig> {
  protected readonly configToken = LOG_CONFIG;
  protected readonly moduleConfig = {
    providers: [LoggerService, { token: LOG_CONFIG, useValue: {} }],
  };
}

// Usage based on environment
const container = new Nexus();

// Development configuration
container.set(
  LoggingModule.config({
    level: 'debug',
    format: 'detailed',
  })
);

// Production configuration
container.set(
  LoggingModule.config({
    level: 'info',
    format: 'json',
  })
);

// Testing configuration
container.set(
  LoggingModule.config({
    level: 'error',
    format: 'minimal',
  })
);
```

</details>

### Feature-Based Configuration

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

This pattern will be supported with dynamic module configuration in future releases.

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

@Module({
  providers: [EmailService, { token: EMAIL_CONFIG, useValue: {} }],
})
class EmailModule extends DynamicModule<EmailConfig> {
  protected readonly configToken = EMAIL_CONFIG;
  protected readonly moduleConfig = {
    providers: [EmailService, { token: EMAIL_CONFIG, useValue: {} }],
  };
}

// Usage
const container = new Nexus();

// Choose email provider based on configuration
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
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
      },
    })
  );
}
```

</details>

### Composite Configuration

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

This pattern will be supported with dynamic module configuration in future releases.

```typescript
@Module({
  providers: [AppService, { token: APP_CONFIG, useValue: {} }],
})
class AppModule extends DynamicModule<{
  database: DatabaseConfig;
  email: EmailConfig;
  logging: LogConfig;
}> {
  protected readonly configToken = APP_CONFIG;
  protected readonly moduleConfig = {
    providers: [AppService, { token: APP_CONFIG, useValue: {} }],
    imports: [
      DatabaseModule.config({} as DatabaseConfig),
      EmailModule.config({} as EmailConfig),
      LoggingModule.config({} as LogConfig),
    ],
  };
}

// Usage
const container = new Nexus();
container.set(
  AppModule.config({
    database: {
      host: 'localhost',
      port: 5432,
      database: 'myapp',
    },
    email: {
      provider: 'sendgrid',
      apiKey: process.env.SENDGRID_API_KEY,
    },
    logging: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })
);
```

</details>

## Configuration Validation

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

Configuration validation will be supported with dynamic module configuration in future releases.

```typescript
@Module({
  providers: [DatabaseService, { token: DATABASE_CONFIG, useValue: {} }],
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
  protected readonly moduleConfig = {
    providers: [DatabaseService, { token: DATABASE_CONFIG, useValue: {} }],
  };

  static config(config: DatabaseConfig) {
    // Validate configuration
    if (!config.host) {
      throw new Error('Database host is required');
    }
    if (!config.port || config.port < 1 || config.port > 65535) {
      throw new Error('Database port must be between 1 and 65535');
    }
    if (!config.database) {
      throw new Error('Database name is required');
    }

    return super.config(config);
  }
}
```

</details>

## Testing with Dynamic Modules

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

Testing with dynamic module configuration will be supported in future releases.

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

</details>

## Current Testing Approach

For now, you can test modules using the current approach:

```typescript
describe('DatabaseModule', () => {
  it('should work with test configuration', () => {
    const container = new Nexus();

    // Use a test-specific module
    @Module({
      providers: [
        DatabaseService,
        {
          token: DATABASE_CONFIG,
          useValue: {
            host: 'localhost',
            port: 5432,
            database: 'test_db',
          },
        },
      ],
    })
    class TestDatabaseModule {}

    container.set(TestDatabaseModule);

    const databaseService = container.get(DATABASE_SERVICE);
    expect(databaseService).toBeInstanceOf(DatabaseService);
  });
});
```

## Next Steps

- **[Module Basics](module-basics.md)** - Learn the fundamentals of modules
- **[Module Patterns](module-patterns.md)** - Explore common module patterns
- **[Advanced Providers & Factories](advanced/advanced-providers-and-factories.md)** - Advanced provider configuration

Dynamic modules will provide powerful runtime configuration capabilities in future releases! 🚀

## 🚀 Async Dynamic Module Registration

Sometimes, your modules need to fetch secrets, load configs, or call APIs before they're ready to join the party. That's where `configAsync()` comes in!

```typescript
// Correct: Wait for the config to finish before registering
const config = await MyModule.configAsync(options);
container.set(config);

// ❌ Don't do this! (You'll hand the chef a recipe that's still in the oven)
container.set(MyModule.configAsync(options)); // Not supported
```

> **Heads up:** Always `await` the result of `configAsync()` before passing it to `set`. The container expects a fully-baked config, not a promise.

With this pattern, your modules will be ready to serve—no half-baked configs allowed. For more on dynamic modules, check out the rest of this guide!
