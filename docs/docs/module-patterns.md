---
sidebar_position: 3
---

# Module Patterns

This article covers advanced module patterns and best practices for organizing your NexusDI modules effectively.

## Advanced Module Patterns

### 1. **Feature Modules**
Organize by application features:

```typescript
// User feature module
@Module({
  services: [UserService, UserRepository, UserValidator],
  providers: [
    { token: USER_CONFIG, useValue: userConfig }
  ]
})
class UserModule {}

// Order feature module
@Module({
  services: [OrderService, OrderRepository, PaymentService],
  providers: [
    { token: PAYMENT_GATEWAY, useClass: StripeGateway }
  ]
})
class OrderModule {}

// Main application module
@Module({
  imports: [UserModule, OrderModule],
  services: [AppService],
  providers: [
    { token: APP_CONFIG, useValue: appConfig }
  ]
})
class AppModule {}
```

### 2. **Infrastructure Modules**
Separate infrastructure concerns:

```typescript
@Module({
  services: [DatabaseService, ConnectionPool],
  providers: [
    { token: DATABASE_CONFIG, useValue: dbConfig }
  ]
})
class DatabaseModule {}

@Module({
  services: [LoggerService, LogFormatter],
  providers: [
    { token: LOG_LEVEL, useValue: process.env.LOG_LEVEL }
  ]
})
class LoggingModule {}

@Module({
  services: [EmailService, TemplateEngine],
  providers: [
    { token: SMTP_CONFIG, useValue: smtpConfig }
  ]
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
    { token: DATABASE_URL, useValue: 'sqlite://dev.db' }
  ]
})
class DevelopmentModule {}

// Production module
@Module({
  services: [ProductionLogger, PostgresDatabase],
  providers: [
    { token: LOG_LEVEL, useValue: 'info' },
    { token: DATABASE_URL, useValue: process.env.DATABASE_URL }
  ]
})
class ProductionModule {}

// Use based on environment
const container = new Nexus();
if (process.env.NODE_ENV === 'production') {
  container.setModule(ProductionModule);
} else {
  container.setModule(DevelopmentModule);
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
    container.setModule(UserModule);
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
    { token: LOGGER, useValue: mockLogger }
  ]
})
class TestUserModule {}

describe('UserModule with mocks', () => {
  it('should work with mocked dependencies', () => {
    const container = new Nexus();
    container.setModule(TestUserModule);
    
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
  providers: [
    { token: USER_CONFIG, useValue: userConfig }
  ]
})
class UserModule {}

// ❌ Bad - mixing unrelated concerns
@Module({
  services: [UserService, EmailService, PaymentService, LoggerService],
  providers: [
    { token: USER_CONFIG, useValue: userConfig },
    { token: EMAIL_CONFIG, useValue: emailConfig },
    { token: PAYMENT_CONFIG, useValue: paymentConfig }
  ]
})
class EverythingModule {}
```

### 2. **Clear Dependencies**
Make module dependencies explicit through imports:

```typescript
// ✅ Good - explicit dependencies
@Module({
  services: [UserService],
  imports: [DatabaseModule, LoggingModule]
})
class UserModule {}

// ❌ Bad - hidden dependencies
@Module({
  services: [UserService]
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
  providers: [
    { token: USER_CONFIG, useValue: userConfig }
  ]
})
class UserModule {}
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
container.setModule(LoggingModule.config({
  level: 'debug',
  format: 'detailed'
}));

// Production configuration
container.setModule(LoggingModule.config({
  level: 'info',
  format: 'json'
}));

// Testing configuration
container.setModule(LoggingModule.config({
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
  container.setModule(EmailModule.config({
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY
  }));
} else if (process.env.EMAIL_PROVIDER === 'mailgun') {
  container.setModule(EmailModule.config({
    provider: 'mailgun',
    apiKey: process.env.MAILGUN_API_KEY
  }));
} else {
  container.setModule(EmailModule.config({
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
container.setModule(AppModule.config({
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
    container.setModule(DatabaseModule.config({
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
      container.setModule(DatabaseModule.config({
        host: '', // Invalid
        port: 5432,
        database: 'test_db'
      }));
    }).toThrow('Database host is required');
  });
});
```

## Summary

Module patterns help you create well-organized, maintainable applications:

- **Feature modules** organize by business domain
- **Infrastructure modules** separate technical concerns
- **Environment-specific modules** handle different deployment scenarios
- **Testing patterns** ensure reliable module testing
- **Configuration patterns** provide flexible setup options
- **Best practices** guide you toward maintainable code

For dynamic module configuration with runtime settings, see [Dynamic Modules](./dynamic-modules.md). 