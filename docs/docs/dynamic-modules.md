---
sidebar_position: 4
---

# Dynamic Modules

Dynamic modules allow you to configure modules at runtime with different settings, making them perfect for environment-specific configurations, feature toggles, and flexible dependency injection setups.

## What are Dynamic Modules?

Dynamic modules extend the `DynamicModule` base class to automatically get `config()` and `configAsync()` methods. This allows you to:

- Configure modules with different settings at runtime
- Use environment-specific configurations
- Validate configuration before module registration
- Support both synchronous and asynchronous configuration

## Basic Dynamic Module

```typescript
import { Module, DynamicModule, Token } from '@nexusdi/core';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
}

const DATABASE_CONFIG = new Token<DatabaseConfig>('DATABASE_CONFIG');

@Module({
  services: [DatabaseService, ConnectionPool], // Simplified format
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
}

// Usage
const container = new Nexus();

// Synchronous configuration
container.set(DatabaseModule.config({
  host: 'localhost',
  port: 5432,
  database: 'myapp'
}));

// Asynchronous configuration
container.set(DatabaseModule.configAsync(async () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS
})));
```

## Configuration Injection in Services

Services within the module can inject the configuration:

```typescript
@Service(DATABASE_SERVICE)
class DatabaseService {
  constructor(@Inject(DATABASE_CONFIG) private config: DatabaseConfig) {}

  async connect() {
    console.log(`Connecting to ${this.config.host}:${this.config.port}/${this.config.database}`);
    // Connection logic
  }
}
```

## Advanced Configuration Patterns

### Environment-Specific Configuration

```typescript
@Module({
  services: [LoggerService],
  providers: [
    { token: LOG_CONFIG, useValue: {} }
  ]
})
class LoggingModule extends DynamicModule<LogConfig> {
  protected readonly configToken = LOG_CONFIG;
  protected readonly moduleConfig = {
    services: [LoggerService],
    providers: [
      { token: LOG_CONFIG, useValue: {} }
    ]
  };
}

// Usage based on environment
const container = new Nexus();

// Development configuration
container.set(LoggingModule.config({
  level: 'debug',
  format: 'detailed'
}));

// Production configuration
container.set(LoggingModule.config({
  level: 'info',
  format: 'json'
}));

// Testing configuration
container.set(LoggingModule.config({
  level: 'error',
  format: 'minimal'
}));
```

### Feature-Based Configuration

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
  services: [EmailService],
  providers: [
    { token: EMAIL_CONFIG, useValue: {} }
  ]
})
class EmailModule extends DynamicModule<EmailConfig> {
  protected readonly configToken = EMAIL_CONFIG;
  protected readonly moduleConfig = {
    services: [EmailService],
    providers: [
      { token: EMAIL_CONFIG, useValue: {} }
    ]
  };
}

// Usage
const container = new Nexus();

// Choose email provider based on configuration
if (process.env.EMAIL_PROVIDER === 'sendgrid') {
  container.set(EmailModule.config({
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY
  }));
} else if (process.env.EMAIL_PROVIDER === 'mailgun') {
  container.set(EmailModule.config({
    provider: 'mailgun',
    apiKey: process.env.MAILGUN_API_KEY
  }));
} else {
  container.set(EmailModule.config({
    provider: 'smtp',
    smtpConfig: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true'
    }
  }));
}
```

### Composite Configuration

```typescript
@Module({
  services: [AppService],
  providers: [
    { token: APP_CONFIG, useValue: {} }
  ]
})
class AppModule extends DynamicModule<{
  database: DatabaseConfig;
  email: EmailConfig;
  logging: LogConfig;
}> {
  protected readonly configToken = APP_CONFIG;
  protected readonly moduleConfig = {
    services: [AppService],
    providers: [
      { token: APP_CONFIG, useValue: {} }
    ],
    imports: [
      DatabaseModule.config({} as DatabaseConfig),
      EmailModule.config({} as EmailConfig),
      LoggingModule.config({} as LogConfig)
    ]
  };
}

// Usage
const container = new Nexus();
container.set(AppModule.config({
  database: {
    host: 'localhost',
    port: 5432,
    database: 'myapp'
  },
  email: {
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY
  },
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
}));
```

## Configuration Validation

You can add validation to your configuration methods:

```typescript
@Module({
  services: [DatabaseService],
  providers: [
    { token: DATABASE_CONFIG, useValue: {} }
  ]
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
  protected readonly moduleConfig = {
    services: [DatabaseService],
    providers: [
      { token: DATABASE_CONFIG, useValue: {} }
    ]
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

## Testing with Dynamic Modules

```typescript
describe('DatabaseModule', () => {
  it('should work with test configuration', () => {
    const container = new Nexus();
    container.set(DatabaseModule.config({
      host: 'localhost',
      port: 5432,
      database: 'test_db'
    }));

    const databaseService = container.get(DATABASE_SERVICE);
    expect(databaseService).toBeInstanceOf(DatabaseService);
  });

  it('should validate configuration', () => {
    expect(() => {
      const container = new Nexus();
      container.set(DatabaseModule.config({
        host: '', // Invalid
        port: 5432,
        database: 'test_db'
      }));
    }).toThrow('Database host is required');
  });
});
```

## Summary

The `DynamicModule` base class approach provides:

- **Automatic Methods**: `config()` and `configAsync()` methods are automatically available
- **Type Safety**: Configuration is fully typed with generics
- **Minimal Boilerplate**: Just extend the base class and define two properties
- **Validation**: Easy to add custom validation by overriding the static methods
- **Flexibility**: Single configuration method with flexible config objects
- **Composability**: Easy to combine configurations
- **Testability**: Simple to test with different configurations
- **Environment Support**: Easy environment-specific configurations

This pattern makes modules much more ergonomic to use while keeping the interface clean and simple.

For advanced dynamic module patterns, see [Advanced Dynamic Modules](advanced/advanced-dynamic-modules.md).

**Note:** As of v0.2.0, use `container.set(...)` to register modules and dynamic modules. `setModule` and `registerDynamicModule` are deprecated and will be removed in a future minor version. As long as the major version is 0, minor version bumps are considered breaking. 