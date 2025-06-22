# Dependency Injection Concepts

## What is Dependency Injection?

Dependency Injection (DI) is a design pattern where dependencies are provided to a class from the outside, rather than the class creating them internally. This promotes loose coupling, testability, and maintainability.

## Recommended Pattern: Tokens + Interfaces

NexusDI promotes using tokens with interfaces rather than direct class references. This approach provides better flexibility and maintainability:

```typescript
// ✅ Recommended: Token + Interface pattern
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<DataSource>('DATABASE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: DataSource) {}
  
  getUser(id: string): Promise<User> {
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

// Usage
const userService = nexus.get(USER_SERVICE); // Type-safe, interface-based
```

**Benefits of this approach:**
- **Interface-driven**: Dependencies are defined by contracts, not implementations
- **Type safety**: Full TypeScript support with generics
- **Flexibility**: Easy to swap implementations without changing consumers
- **Explicit**: Clear what dependencies are available in your system
- **Testable**: Easy to mock with interface-based tokens

## Core Principles

### 1. Inversion of Control (IoC)

**Traditional approach (Control inside the class):**
```typescript
class UserService {
  private database = new PostgresDatabase(); // Class controls its dependencies
  private logger = new ConsoleLogger();
}
```

**DI approach with tokens (Control outside the class):**
```typescript
export const DATABASE = new Token<DataSource>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: DataSource, // Dependencies injected from outside
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

### 2. Dependency on Abstractions

Always depend on interfaces, not concrete implementations:

```typescript
// ✅ Good - depends on interface with token
interface IUserService {
  getUser(id: string): Promise<User>;
}

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: DataSource) {}
  
  getUser(id: string): Promise<User> {
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

// ❌ Bad - depends on concrete implementation
class UserService {
  constructor(private database: PostgresDatabase) {} // Depends on concrete class
}
```

### 3. Single Responsibility Principle

Each class should have only one reason to change:

```typescript
// ❌ Bad - class handles both business logic and object creation
class UserService {
  private database = new PostgresDatabase();
  private logger = new ConsoleLogger();
  private emailService = new GmailEmailService();
  
  getUser(id: string) {
    // Business logic mixed with object creation
  }
}

// ✅ Good - class focuses only on business logic
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: DataSource,
    @Inject(LOGGER) private logger: ILogger,
    @Inject(EMAIL_SERVICE) private emailService: IEmailService
  ) {}
  
  getUser(id: string) {
    // Pure business logic
  }
}
```

## Benefits of Dependency Injection

### 1. Testability

**Without DI - Hard to test:**
```typescript
class UserService {
  private database = new PostgresDatabase();
  
  getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

// Testing is difficult - need real database connection
const userService = new UserService(); // Creates real database connection
```

**With DI and tokens - Easy to test:**
```typescript
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<DataSource>('DATABASE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: DataSource) {}
  
  getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

// Easy to test with mocks
const mockDatabase = { query: vi.fn().mockReturnValue({ id: '123', name: 'John' }) };
nexus.set(DATABASE, { useValue: mockDatabase });
const userService = nexus.get(USER_SERVICE);
const user = userService.getUser('123');
expect(mockDatabase.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = '123'");
```

### 2. Flexibility and Configuration

**Easy to switch implementations:**
```typescript
// Development environment
const devNexus = new Nexus();
devNexus.set(DATABASE, { useClass: InMemoryDatabase });
devNexus.set(LOGGER, { useClass: ConsoleLogger });

// Production environment
const prodNexus = new Nexus();
prodNexus.set(DATABASE, { useClass: PostgresDatabase });
prodNexus.set(LOGGER, { useClass: FileLogger });

// Same UserService works with both configurations
const userService = devNexus.get(USER_SERVICE); // Uses InMemoryDatabase
const userService = prodNexus.get(USER_SERVICE); // Uses PostgresDatabase
```

### 3. Maintainability

**Changes are isolated:**
```typescript
// If you need to change the database implementation, you only change the registration
// No need to modify UserService, OrderService, ProductService, etc.

// Before
nexus.set(DATABASE, { useClass: PostgresDatabase });

// After - just change this line
nexus.set(DATABASE, { useClass: MongoDBDatabase });
// All services automatically use the new database
```

### 4. Reusability

**Same class works in different contexts:**
```typescript
interface IEmailService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

export const EMAIL_SERVICE = new Token<IEmailService>('EMAIL_SERVICE');

@Service(EMAIL_SERVICE)
class EmailService implements IEmailService {
  constructor(@Inject(EMAIL_PROVIDER) private emailProvider: IEmailProvider) {}
  
  sendWelcomeEmail(user: User) {
    return this.emailProvider.send({
      to: user.email,
      subject: 'Welcome!',
      body: 'Welcome to our platform!'
    });
  }
}

// Web application
const webNexus = new Nexus();
webNexus.set(EMAIL_PROVIDER, { useClass: SendGridProvider });
const webEmailService = webNexus.get(EMAIL_SERVICE);

// Mobile application
const mobileNexus = new Nexus();
mobileNexus.set(EMAIL_PROVIDER, { useClass: FirebaseProvider });
const mobileEmailService = mobileNexus.get(EMAIL_SERVICE);

// Same EmailService class, different providers
```

## Common Patterns

### 1. Constructor Injection with Tokens

The most common pattern - inject dependencies through the constructor using tokens:

```typescript
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<DataSource>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: DataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

### 2. Property Injection with Tokens

Inject dependencies into properties using tokens:

```typescript
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  @Inject(DATABASE)
  private database!: DataSource;
  
  @Inject(LOGGER)
  private logger!: ILogger;
}
```

### 3. Method Injection with Tokens

Inject dependencies into specific methods using tokens:

```typescript
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  processUser(@Inject(DATABASE) database: DataSource, userId: string) {
    return database.query(`SELECT * FROM users WHERE id = '${userId}'`);
  }
}
```

## When to Use Dependency Injection

### ✅ Good Use Cases

- **Services with external dependencies** (databases, APIs, file systems)
- **Classes that need to be tested in isolation**
- **Applications with multiple environments** (dev, staging, production)
- **Libraries and frameworks** that need to be configurable
- **Complex applications** with many interconnected components

### ❌ When Not to Use

- **Simple utility functions** that don't have dependencies
- **Value objects** (data structures without behavior)
- **Configuration objects** that are just data
- **Very small applications** where DI adds unnecessary complexity

## Best Practices

### 1. Use Tokens with Interfaces

```typescript
interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

export const LOGGER = new Token<ILogger>('LOGGER');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(LOGGER) private logger: ILogger) {} // Interface, not concrete class
}
```

### 2. Keep Dependencies Minimal

```typescript
// ❌ Too many dependencies
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: DataSource,
    @Inject(LOGGER) private logger: ILogger,
    @Inject(EMAIL_SERVICE) private emailService: IEmailService,
    @Inject(CACHE_SERVICE) private cacheService: ICacheService,
    @Inject(ANALYTICS_SERVICE) private analyticsService: IAnalyticsService,
    @Inject(NOTIFICATION_SERVICE) private notificationService: INotificationService
  ) {}
}

// ✅ Focused dependencies
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: DataSource,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

### 3. Use Meaningful Token Names

```typescript
// ❌ Unclear tokens
const DB = new Token();
const LOG = new Token();

// ✅ Clear, descriptive tokens
export const DATABASE = new Token<DataSource>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');
```

### 4. Group Related Services in Modules

```typescript
@Module({
  services: [UserService, UserRepository, UserValidator],
  providers: [
    { token: DATABASE, useClass: PostgresDatabase }
  ]
})
class UserModule {}
```

### 5. Export Tokens and Interfaces

```typescript
// tokens.ts
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<DataSource>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');

// interfaces.ts
export interface IUserService {
  getUser(id: string): Promise<User>;
}

export interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

// user.service.ts
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: DataSource) {}
}
```

Dependency Injection with tokens and interfaces is a powerful pattern that, when used correctly, makes your code more maintainable, testable, and flexible. NexusDI provides a clean, modern API for implementing this pattern in your TypeScript applications. 