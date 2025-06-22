# Modules

Modules are a powerful way to organize and structure your dependency injection setup in NexusDI. They allow you to group related services, providers, and configuration into logical units that can be easily imported, reused, and tested.

## What are Modules?

A module is a class decorated with `@Module()` that defines a collection of:
- **Services** - Classes that provide functionality
- **Providers** - Dependencies that can be injected
- **Imports** - Other modules to include
- **Exports** - Services/providers to make available to other modules

## Why Use Modules?

### 1. **Organization & Structure**
Modules help you organize your application into logical, cohesive units:

```typescript
// Instead of one giant container with everything mixed together
const container = new Nexus();
container.set(USER_SERVICE, { useClass: UserService });
container.set(EMAIL_SERVICE, { useClass: EmailService });
container.set(DATABASE, { useClass: Database });
container.set(LOGGER, { useClass: Logger });
// ... 50 more services

// You can organize into focused modules
@Module({
  services: [UserService, UserRepository],
  providers: [
    { token: DATABASE, useClass: Database }
  ]
})
class UserModule {}

@Module({
  services: [EmailService, NotificationService],
  providers: [
    { token: EMAIL_CONFIG, useValue: emailConfig }
  ]
})
class NotificationModule {}
```

### 2. **Reusability**
Modules can be reused across different applications or parts of your application:

```typescript
// Reusable authentication module
@Module({
  services: [AuthService, JwtService, PasswordService],
  providers: [
    { token: AUTH_CONFIG, useValue: authConfig }
  ]
})
class AuthModule {}

// Use in different applications
const app1 = new Nexus();
app1.registerModule(AuthModule);

const app2 = new Nexus();
app2.registerModule(AuthModule);
```

### 3. **Testing & Mocking**
Modules make it easier to test specific parts of your application:

```typescript
// Test with mocked dependencies
@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useValue: mockDatabase },
    { token: LOGGER, useValue: mockLogger }
  ]
})
class TestUserModule {}

const testContainer = new Nexus();
testContainer.registerModule(TestUserModule);
```

### 4. **Configuration Management**
Modules can encapsulate configuration and environment-specific settings:

```typescript
@Module({
  services: [DatabaseService],
  providers: [
    { 
      token: DATABASE_CONFIG, 
      useFactory: () => ({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME
      })
    }
  ]
})
class DatabaseModule {}
```

## Creating Modules

### Basic Module Structure

```typescript
import { Module, Service, Token, Inject } from '@nexusdi/core';

// Define tokens
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDatabase>('DATABASE');

// Define services
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private db: IDatabase) {}
  
  async getUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

// Create the module
@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase }
  ]
})
export class UserModule {}
```

### Module with Imports

Modules can import other modules to compose functionality:

```typescript
@Module({
  services: [AuthService],
  providers: [
    { token: JWT_SECRET, useValue: process.env.JWT_SECRET }
  ]
})
class AuthModule {}

@Module({
  services: [UserService],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase }
  ],
  imports: [AuthModule] // Import the auth module
})
class UserModule {}
```

### Module with Exports

Export services to make them available to other modules:

```typescript
@Module({
  services: [DatabaseService, ConnectionPool],
  providers: [
    { token: DATABASE_CONFIG, useValue: dbConfig }
  ],
  exports: [DATABASE_SERVICE] // Export for other modules to use
})
class DatabaseModule {}
```

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
  container.registerModule(ProductionModule);
} else {
  container.registerModule(DevelopmentModule);
}
```

## Module Registration

### Registering Modules

```typescript
import { Nexus } from '@nexusdi/core';
import { UserModule, OrderModule } from './modules';

const container = new Nexus();

// Register individual modules
container.registerModule(UserModule);
container.registerModule(OrderModule);

// Or register multiple at once
container.registerModule(UserModule, OrderModule);
```

### Module Dependencies

Modules can depend on each other through imports:

```typescript
@Module({
  services: [DatabaseService],
  providers: [
    { token: DATABASE_CONFIG, useValue: dbConfig }
  ]
})
class DatabaseModule {}

@Module({
  services: [UserService],
  imports: [DatabaseModule] // Depends on DatabaseModule
})
class UserModule {}

@Module({
  services: [OrderService],
  imports: [DatabaseModule, UserModule] // Depends on both
})
class OrderModule {}
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
    container.registerModule(UserModule);
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
    container.registerModule(TestUserModule);
    
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

## Module Configuration

### Provider Registration

NexusDI supports two formats for registering providers in modules:

#### Simplified Format (Recommended)
When a service is decorated with `@Service(token)`, you can simply include the service class in the providers array:

```typescript
@Module({
  providers: [
    LoggerService, // Automatically uses the token from @Service decorator
    UserService,   // Automatically uses the token from @Service decorator
  ],
})
class AppModule {}
```

#### Full Provider Format
For more complex scenarios, you can use the full provider object format:

```typescript
@Module({
  providers: [
    { token: LOGGER_SERVICE_TOKEN, useClass: LoggerService },
    { token: USER_SERVICE_TOKEN, useClass: UserService },
    { token: CONFIG_TOKEN, useValue: { apiUrl: 'https://api.example.com' } },
    { token: FACTORY_TOKEN, useFactory: () => new SomeService() },
  ],
})
class AppModule {}
```

### Dynamic Module Configuration with DynamicModule Base Class

Modules can extend the `DynamicModule` base class to automatically get `config()` and `configAsync()` methods:

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
container.registerDynamicModule(DatabaseModule.config({
  host: 'localhost',
  port: 5432,
  database: 'myapp'
}));

// Asynchronous configuration
container.registerDynamicModule(DatabaseModule.configAsync(async () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS
})));
```

### Configuration Injection in Services

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

### Advanced Configuration Patterns

#### Environment-Specific Configuration

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
container.registerDynamicModule(LoggingModule.config({
  level: 'debug',
  format: 'detailed'
}));

// Production configuration
container.registerDynamicModule(LoggingModule.config({
  level: 'info',
  format: 'json'
}));

// Testing configuration
container.registerDynamicModule(LoggingModule.config({
  level: 'error',
  format: 'minimal'
}));
```

#### Feature-Based Configuration

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
  container.registerDynamicModule(EmailModule.config({
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY
  }));
} else if (process.env.EMAIL_PROVIDER === 'mailgun') {
  container.registerDynamicModule(EmailModule.config({
    provider: 'mailgun',
    apiKey: process.env.MAILGUN_API_KEY
  }));
} else {
  container.registerDynamicModule(EmailModule.config({
    provider: 'smtp',
    smtpConfig: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true'
    }
  }));
}
```

#### Composite Configuration

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
container.registerDynamicModule(AppModule.config({
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

### Configuration Validation

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

### Testing with Dynamic Modules

```typescript
describe('DatabaseModule', () => {
  it('should work with test configuration', () => {
    const container = new Nexus();
    container.registerDynamicModule(DatabaseModule.config({
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
      container.registerDynamicModule(DatabaseModule.config({
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