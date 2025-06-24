---
sidebar_position: 2
---

# Module Basics

Modules are a powerful way to organize and structure your dependency injection setup in NexusDI. They allow you to group related services, providers, and configuration into logical units that can be easily imported, reused, and tested. Much like the modular habitat systems on Mars, each module has specialized functions but can be connected to create something greater than the sum of its parts.

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
// Instead of one giant Nexus container with everything mixed together
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
app1.set(AuthModule);
app1.set(UserModule);

const app2 = new Nexus();
app2.set(AuthModule);
app2.set(OrderModule);
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
testContainer.set(TestUserModule);
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

## Module Registration

### Register Modules

```typescript
import { Nexus } from '@nexusdi/core';
import { UserModule, OrderModule } from './modules';

const container = new Nexus();

// Register individual modules
container.set(UserModule);
container.set(OrderModule);

// Or register multiple at once
container.set(UserModule, OrderModule);
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

## Summary

Modules provide a powerful way to organize your dependency injection setup:

- **Organization**: Group related services and providers into logical units
- **Reusability**: Share modules across different applications
- **Testing**: Easily mock and test specific parts of your application
- **Configuration**: Encapsulate environment-specific settings
- **Composability**: Import and combine modules as needed

For advanced module patterns and dynamic configuration, see [Module Patterns](./module-patterns.md) and [Dynamic Modules](./dynamic-modules.md).

For advanced topics such as dynamic modules, lifetimes, multi-injection, and more, see the [Advanced](./advanced.md) section.

## Next Steps

- **[Module Patterns](./module-patterns.md)** - Advanced patterns and best practices
- **[Dynamic Modules](./dynamic-modules.md)** - Runtime configuration and validation
- **[Testing](./testing.md)** - How to test modules and services 