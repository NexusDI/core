---
sidebar_position: 3
---

# Module Patterns

This article covers advanced module patterns and best practices for organizing your NexusDI modules effectively. Your modules are like Bob's various clones - each thinks they're the most important one, but they all need to stop arguing and work together if you want anything to actually get done.

## Advanced Module Patterns

### 1. **Feature Modules**

Organize by application features:

```typescript
// User feature module
@Module({
  services: [UserService, UserRepository, UserValidator],
  providers: [{ token: USER_CONFIG, useValue: userConfig }],
})
class UserModule {}

// Order feature module
@Module({
  services: [OrderService, OrderRepository, PaymentService],
  providers: [{ token: PAYMENT_GATEWAY, useClass: StripeGateway }],
})
class OrderModule {}

// Main application module
@Module({
  imports: [UserModule, OrderModule],
  services: [AppService],
  providers: [{ token: APP_CONFIG, useValue: appConfig }],
})
class AppModule {}
```

### 2. **Infrastructure Modules**

Separate infrastructure concerns:

```typescript
@Module({
  services: [DatabaseService, ConnectionPool],
  providers: [{ token: DATABASE_CONFIG, useValue: dbConfig }],
})
class DatabaseModule {}

@Module({
  services: [LoggerService, LogFormatter],
  providers: [{ token: LOG_LEVEL, useValue: process.env.LOG_LEVEL }],
})
class LoggingModule {}

@Module({
  services: [EmailService, TemplateEngine],
  providers: [{ token: SMTP_CONFIG, useValue: smtpConfig }],
})
class EmailModule {}
```

### 3. **Environment-Specific Modules**

Different modules for different environments:

```typescript
// Development module
@Module({
  services: [DevLogger, DevDatabase],
  providers: [
    { token: LOG_LEVEL, useValue: 'debug' },
    { token: DATABASE_URL, useValue: 'sqlite://dev.db' },
  ],
})
class DevelopmentModule {}

// Production module
@Module({
  services: [ProductionLogger, PostgresDatabase],
  providers: [
    { token: LOG_LEVEL, useValue: 'info' },
    { token: DATABASE_URL, useValue: process.env.DATABASE_URL },
  ],
})
class ProductionModule {}

// Use based on environment
const container = new Nexus();
if (process.env.NODE_ENV === 'production') {
  container.set(ProductionModule);
} else {
  container.set(DevelopmentModule);
}
```

## Testing with Modules

### Unit Testing Modules

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Nexus } from '@nexusdi/core';
import { UserModule } from './modules/user.module';

describe('UserModule', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
    container.set(UserModule);
  });

  it('should provide UserService', () => {
    const userService = container.get(USER_SERVICE);
    expect(userService).toBeInstanceOf(UserService);
  });

  it('should inject dependencies correctly', () => {
    const userService = container.get(USER_SERVICE);
    const result = userService.getUser('123');
    expect(result).toBeDefined();
  });
});
```

### Mocking Module Dependencies

```typescript
// Create a test module with mocked dependencies
@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useValue: mockDatabase },
    { token: LOGGER, useValue: mockLogger },
  ],
})
class TestUserModule {}

describe('UserModule with mocks', () => {
  it('should work with mocked dependencies', () => {
    const container = new Nexus();
    container.set(TestUserModule);

    const userService = container.get(USER_SERVICE);
    // Test with mocked dependencies
  });
});
```

## Best Practices

### 1. **Single Responsibility**

Each module should have a single, well-defined responsibility:

```typescript
// ✅ Good - focused on user management
@Module({
  services: [UserService, UserRepository, UserValidator],
  providers: [{ token: USER_CONFIG, useValue: userConfig }],
})
class UserModule {}

// ❌ Bad - mixing unrelated concerns
@Module({
  services: [UserService, EmailService, PaymentService, LoggerService],
  providers: [
    { token: USER_CONFIG, useValue: userConfig },
    { token: EMAIL_CONFIG, useValue: emailConfig },
    { token: PAYMENT_CONFIG, useValue: paymentConfig },
  ],
})
class EverythingModule {}
```

### 2. **Clear Dependencies**

Make module dependencies explicit through imports:

```typescript
// ✅ Good - explicit dependencies
@Module({
  services: [UserService],
  imports: [DatabaseModule, LoggingModule],
})
class UserModule {}

// ❌ Bad - hidden dependencies
@Module({
  services: [UserService],
  // Missing imports, but UserService depends on DatabaseModule
})
class UserModule {}
```

### 3. **Consistent Naming**

Use consistent naming conventions:

```typescript
// ✅ Good - consistent naming
class UserModule {}
class OrderModule {}
class DatabaseModule {}

// ❌ Bad - inconsistent naming
class UserModule {}
class Orders {}
class DB {}
```

### 4. **Documentation**

Document your modules with clear descriptions:

```typescript
/**
 * User management module
 *
 * Provides user-related services including:
 * - User creation and management
 * - Authentication and authorization
 * - User profile operations
 *
 * Dependencies:
 * - DatabaseModule for data persistence
 * - LoggingModule for audit trails
 */
@Module({
  services: [UserService, UserRepository, UserValidator],
  imports: [DatabaseModule, LoggingModule],
  providers: [{ token: USER_CONFIG, useValue: userConfig }],
})
class UserModule {}
```

## Advanced Configuration Patterns

### Environment-Specific Configuration

You can achieve environment-specific configuration by creating separate modules for each environment:

```typescript
@Module({
  services: [LoggerService],
  providers: [
    { token: LOG_CONFIG, useValue: { level: 'debug', format: 'detailed' } },
  ],
})
class DevelopmentLoggingModule {}

@Module({
  services: [LoggerService],
  providers: [
    { token: LOG_CONFIG, useValue: { level: 'info', format: 'json' } },
  ],
})
class ProductionLoggingModule {}

@Module({
  services: [LoggerService],
  providers: [
    { token: LOG_CONFIG, useValue: { level: 'error', format: 'minimal' } },
  ],
})
class TestingLoggingModule {}

// Usage
const container = new Nexus();

if (process.env.NODE_ENV === 'production') {
  container.set(ProductionLoggingModule);
} else if (process.env.NODE_ENV === 'test') {
  container.set(TestingLoggingModule);
} else {
  container.set(DevelopmentLoggingModule);
}
```

### Feature-Based Configuration

Create different modules for different feature configurations:

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
  providers: [{ token: EMAIL_CONFIG, useValue: { provider: 'sendgrid' } }],
})
class SendGridEmailModule {}

@Module({
  services: [EmailService],
  providers: [{ token: EMAIL_CONFIG, useValue: { provider: 'mailgun' } }],
})
class MailgunEmailModule {}

@Module({
  services: [EmailService],
  providers: [{ token: EMAIL_CONFIG, useValue: { provider: 'smtp' } }],
})
class SmtpEmailModule {}

// Usage
const container = new Nexus();

// Choose email provider based on configuration
if (process.env.EMAIL_PROVIDER === 'sendgrid') {
  container.set(SendGridEmailModule);
} else if (process.env.EMAIL_PROVIDER === 'mailgun') {
  container.set(MailgunEmailModule);
} else {
  container.set(SmtpEmailModule);
}
```

### Composite Configuration

Create composite modules that import other modules:

```typescript
@Module({
  services: [DatabaseService],
  providers: [
    {
      token: DATABASE_CONFIG,
      useValue: { host: 'localhost', port: 5432, database: 'myapp' },
    },
  ],
})
class DatabaseModule {}

@Module({
  services: [EmailService],
  providers: [
    {
      token: EMAIL_CONFIG,
      useValue: { provider: 'sendgrid', apiKey: process.env.SENDGRID_API_KEY },
    },
  ],
})
class EmailModule {}

@Module({
  services: [LoggerService],
  providers: [
    {
      token: LOG_CONFIG,
      useValue: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
    },
  ],
})
class LoggingModule {}

@Module({
  services: [AppService],
  imports: [DatabaseModule, EmailModule, LoggingModule],
})
class AppModule {}

// Usage
const container = new Nexus();
container.set(AppModule);
```

## Configuration Validation

You can validate configuration by creating factory functions that validate before creating modules:

```typescript
function validateDatabaseConfig(config: DatabaseConfig): void {
  if (!config.host) {
    throw new Error('Database host is required');
  }
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error('Database port must be between 1 and 65535');
  }
  if (!config.database) {
    throw new Error('Database name is required');
  }
}

function createDatabaseModule(config: DatabaseConfig) {
  validateDatabaseConfig(config);

  @Module({
    services: [DatabaseService],
    providers: [{ token: DATABASE_CONFIG, useValue: config }],
  })
  class ValidatedDatabaseModule {}

  return ValidatedDatabaseModule;
}

// Usage
const container = new Nexus();
const DatabaseModule = createDatabaseModule({
  host: 'localhost',
  port: 5432,
  database: 'myapp',
});
container.set(DatabaseModule);
```

## Testing with Dynamic Modules

You can test different configurations by creating test-specific modules:

```typescript
describe('DatabaseModule', () => {
  it('should work with test configuration', () => {
    const container = new Nexus();

    @Module({
      services: [DatabaseService],
      providers: [
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

  it('should validate configuration', () => {
    expect(() => {
      createDatabaseModule({
        host: '', // Invalid
        port: 5432,
        database: 'test_db',
      });
    }).toThrow('Database host is required');
  });
});
```

## Advanced Patterns & Further Reading

- For dynamic module configuration with runtime settings, see [Dynamic Modules](./dynamic-modules.md).
- For multi-injection and plugin systems, see [Multi-injection & Collections](../advanced/multi-injection-and-collections.md).
- For lifetimes and scoping, see [Scoped & Transient Lifetimes](../advanced/scoped-and-transient-lifetimes.md).
- For interceptors and middleware, see [Interceptors & Middleware](../advanced/interceptors-and-middleware.md).

## Summary

Module patterns help you create well-organized, maintainable applications:

- **Feature modules** organize by business domain
- **Infrastructure modules** separate technical concerns
- **Environment-specific modules** handle different deployment scenarios
- **Testing patterns** ensure reliable module testing
- **Configuration patterns** provide flexible setup options
- **Best practices** guide you toward maintainable code

For dynamic module configuration with runtime settings, see [Dynamic Modules](./dynamic-modules.md).

## Next Steps

- **[Dynamic Modules](./dynamic-modules.md)** - Runtime configuration and validation
- **[Testing](../testing.md)** - How to test modules and services
- **[Advanced](../advanced/advanced.md)** - Advanced patterns and techniques
