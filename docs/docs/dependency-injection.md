---
sidebar_position: 2
---

# Dependency Injection

## What is Dependency Injection?

Dependency Injection (DI) is a design pattern where dependencies are provided to a class from the outside, rather than the class creating them internally. This promotes loose coupling, testability, and maintainability.

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

Always depend on interfaces, not concrete implementations. This principle is fundamental to creating flexible, testable, and maintainable code.

#### Why Interfaces and Tokens Are Better

**1. Loose Coupling**
```typescript
// ❌ Bad - tight coupling to concrete implementation
class UserService {
  constructor(private database: PostgresDatabase) {} // Bound to PostgreSQL
}

// If you want to switch to MongoDB, you must change this class
class UserService {
  constructor(private database: MongoDBDatabase) {} // Now bound to MongoDB
}
```

**With interfaces and tokens - loose coupling:**
```typescript
// ✅ Good - depends on interface with token
interface IUserService {
  getUser(id: string): Promise<User>;
}

interface IDatabase {
  query(sql: string, params: any[]): Promise<any>;
}

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const DATABASE = new Token<IDatabase>('DATABASE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDatabase) {} // Depends on interface
  
  getUser(id: string): Promise<User> {
    return this.database.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

// Switch implementations without changing UserService
nexus.set(DATABASE, { useClass: PostgresDatabase }); // PostgreSQL
nexus.set(DATABASE, { useClass: MongoDBDatabase });  // MongoDB
nexus.set(DATABASE, { useClass: InMemoryDatabase }); // In-memory for tests
```

**2. Easier Testing**
```typescript
// ❌ Bad - hard to test with concrete dependencies
class UserService {
  constructor(private database: PostgresDatabase) {}
  
  async getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

// Testing requires real PostgreSQL connection
const userService = new UserService(new PostgresDatabase()); // Expensive!
```

**With interfaces - easy testing:**
```typescript
// ✅ Good - easy to test with mocks
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private database: IDatabase) {}
  
  async getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

// Testing with simple mocks
const mockDatabase = {
  query: vi.fn().mockResolvedValue({ id: '123', name: 'John' })
};

nexus.set(DATABASE, { useValue: mockDatabase });
const userService = nexus.get(USER_SERVICE);

// Test without any real database
const user = await userService.getUser('123');
expect(mockDatabase.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', ['123']);
```

**3. Runtime Flexibility**
```typescript
// ❌ Bad - compile-time decisions
class EmailService {
  constructor(private provider: SendGridProvider) {} // Always SendGrid
}

// Can't change email provider without code changes
```

**With interfaces - runtime decisions:**
```typescript
// ✅ Good - runtime configuration
interface IEmailProvider {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

@Service(EMAIL_SERVICE)
class EmailService implements IEmailService {
  constructor(@Inject(EMAIL_PROVIDER) private provider: IEmailProvider) {}
  
  async sendWelcomeEmail(user: User) {
    await this.provider.sendEmail(user.email, 'Welcome!', 'Welcome to our platform!');
  }
}

// Choose provider at runtime based on configuration
if (process.env.EMAIL_PROVIDER === 'sendgrid') {
  nexus.set(EMAIL_PROVIDER, { useClass: SendGridProvider });
} else if (process.env.EMAIL_PROVIDER === 'mailgun') {
  nexus.set(EMAIL_PROVIDER, { useClass: MailgunProvider });
} else {
  nexus.set(EMAIL_PROVIDER, { useClass: ConsoleEmailProvider }); // For development
}
```

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

## Summary

Dependency Injection with interfaces and tokens provides:
- **Loose coupling** between components
- **Easy testing** with mocks and stubs
- **Runtime flexibility** for configuration
- **Better error handling** and edge case testing
- **Environment-specific behavior**
- **Future-proofing** for easy extension 