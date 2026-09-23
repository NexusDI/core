---
sidebar_position: 1
title: 'Best Practices'
description: 'Learn the proven patterns and best practices for building maintainable, testable, and scalable applications with NexusDI. Follow these guidelines to write better code.'
tags:
  ['best-practices', 'patterns', 'maintainability', 'testing', 'scalability']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🎯 Best Practices

Welcome to the best practices guide! This is your roadmap to writing clean, maintainable, and scalable code with NexusDI. Think of these practices as the Jedi Code - they'll guide you toward building applications that are not just functional, but truly elegant and maintainable.

## 🏗️ Architecture Principles

### 1. Single Responsibility Principle

Each service should have one reason to change. Keep your services focused and cohesive.

```typescript
// ✅ Good - Single responsibility
@Service()
class UserService {
  async getUser(id: number) {
    // Only user-related logic
  }

  async updateUser(id: number, data: UserData) {
    // Only user-related logic
  }
}

// ❌ Bad - Multiple responsibilities
@Service()
class UserService {
  async getUser(id: number) {
    // User logic
  }

  async sendEmail(to: string, subject: string) {
    // Email logic - should be in EmailService
  }

  async processPayment(amount: number) {
    // Payment logic - should be in PaymentService
  }
}
```

### 2. Dependency Inversion Principle

Depend on abstractions, not concretions. Use interfaces to decouple your services.

```typescript
// ✅ Good - Depends on abstraction
interface IUserRepository {
  findById(id: number): Promise<User>;
  save(user: User): Promise<void>;
}

@Service()
class UserService {
  constructor(@Inject() private userRepo: IUserRepository) {}

  async getUser(id: number) {
    return await this.userRepo.findById(id);
  }
}

// ❌ Bad - Depends on concrete implementation
@Service()
class UserService {
  constructor(@Inject() private userRepo: DatabaseUserRepository) {}

  async getUser(id: number) {
    return await this.userRepo.findById(id);
  }
}
```

### 3. Interface Segregation Principle

Create focused interfaces that clients actually need.

```typescript
// ✅ Good - Focused interfaces
interface IUserReader {
  findById(id: number): Promise<User>;
  findAll(): Promise<User[]>;
}

interface IUserWriter {
  save(user: User): Promise<void>;
  delete(id: number): Promise<void>;
}

// ❌ Bad - Fat interface
interface IUserRepository {
  findById(id: number): Promise<User>;
  findAll(): Promise<User[]>;
  save(user: User): Promise<void>;
  delete(id: number): Promise<void>;
  sendEmail(to: string, subject: string): Promise<void>;
  processPayment(amount: number): Promise<void>;
}
```

## 🏷️ Naming Conventions

### 1. Service Names

Use descriptive, consistent names for your services.

```typescript
// ✅ Good - Clear and descriptive
@Service()
class UserService {}

@Service()
class EmailService {}

@Service()
class PaymentGatewayService {}

// ❌ Bad - Vague or inconsistent
@Service()
class Service {}

@Service()
class Email {}

@Service()
class PaymentGateway {}
```

### 2. Interface Names

Prefix interfaces with 'I' to distinguish them from classes.

```typescript
// ✅ Good - Clear interface naming
interface IUserRepository {}
interface IEmailService {}
interface IPaymentGateway {}

// ❌ Bad - Confusing naming
interface UserRepository {} // Looks like a class
interface EmailService {} // Looks like a class
```

### 3. Token Names

Use consistent token naming patterns.

```typescript
// ✅ Good - Consistent token naming
const USER_SERVICE_TOKEN = Symbol('UserService');
const EMAIL_SERVICE_TOKEN = Symbol('EmailService');
const DATABASE_CONNECTION_TOKEN = Symbol('DatabaseConnection');

// ❌ Bad - Inconsistent naming
const userService = Symbol('UserService');
const EMAIL_SERVICE = Symbol('EmailService');
const dbConn = Symbol('DatabaseConnection');
```

## 🏗️ Module Organization

### 1. Feature-Based Modules

Organize modules by feature, not by technical concerns.

```typescript
// ✅ Good - Feature-based organization
@Module({
  providers: [UserService, UserRepository, UserController],
  exports: [UserService],
})
class UserModule {}

@Module({
  providers: [ProductService, ProductRepository, ProductController],
  exports: [ProductService],
})
class ProductModule {}

// ❌ Bad - Technical-based organization
@Module({
  providers: [UserService, ProductService, OrderService],
  exports: [UserService, ProductService, OrderService],
})
class ServiceModule {}
```

### 2. Clear Module Boundaries

Define clear boundaries between modules.

```typescript
// ✅ Good - Clear boundaries
@Module({
  providers: [UserService, UserRepository],
  exports: [UserService], // Only export what's needed
})
class UserModule {}

@Module({
  providers: [OrderService, OrderRepository],
  imports: [UserModule], // Import only what's needed
  exports: [OrderService],
})
class OrderModule {}

// ❌ Bad - Leaky boundaries
@Module({
  providers: [UserService, UserRepository, OrderService, OrderRepository],
  exports: [UserService, UserRepository, OrderService, OrderRepository],
})
class EverythingModule {}
```

## 🔧 Service Design

### 1. Constructor Injection

Always use constructor injection for dependencies.

```typescript
// ✅ Good - Constructor injection
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: IUserRepository,
    @Inject() private emailService: IEmailService,
    @Inject() private logger: ILogger
  ) {}
}

// ❌ Bad - Property injection or manual instantiation
@Service()
class UserService {
  @Inject() private userRepo: IUserRepository;

  constructor() {
    this.emailService = new EmailService(); // Manual instantiation
  }
}
```

### 2. Immutable Dependencies

Make dependencies immutable after injection.

```typescript
// ✅ Good - Immutable dependencies
@Service()
class UserService {
  constructor(
    @Inject() private readonly userRepo: IUserRepository,
    @Inject() private readonly emailService: IEmailService
  ) {}
}

// ❌ Bad - Mutable dependencies
@Service()
class UserService {
  constructor(@Inject() private userRepo: IUserRepository) {}

  setUserRepository(repo: IUserRepository) {
    this.userRepo = repo; // Dependencies should be immutable
  }
}
```

### 3. Async Service Initialization

Handle async initialization properly.

```typescript
// ✅ Good - Proper async initialization
@Service()
class DatabaseService {
  private connection: DatabaseConnection;

  async initialize() {
    this.connection = await Database.connect();
  }

  async query(sql: string) {
    if (!this.connection) {
      await this.initialize();
    }
    return await this.connection.query(sql);
  }
}

// ❌ Bad - Blocking constructor
@Service()
class DatabaseService {
  private connection: DatabaseConnection;

  constructor() {
    // Don't do async work in constructor
    this.connection = await Database.connect(); // This won't work
  }
}
```

## 🧪 Testing Best Practices

### 1. Mock Dependencies

Always mock dependencies in tests.

```typescript
// ✅ Good - Mocked dependencies
describe('UserService', () => {
  let userService: UserService;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockEmailService: jest.Mocked<IEmailService>;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      save: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    mockEmailService = {
      sendEmail: jest.fn(),
    } as jest.Mocked<IEmailService>;

    userService = new UserService(mockUserRepo, mockEmailService);
  });

  it('should get user by id', async () => {
    const user = { id: 1, name: 'Luke' };
    mockUserRepo.findById.mockResolvedValue(user);

    const result = await userService.getUser(1);

    expect(result).toEqual(user);
    expect(mockUserRepo.findById).toHaveBeenCalledWith(1);
  });
});

// ❌ Bad - Real dependencies in tests
describe('UserService', () => {
  it('should get user by id', async () => {
    const userService = new UserService(
      new DatabaseUserRepository(), // Real dependency
      new SMTPEmailService() // Real dependency
    );

    const result = await userService.getUser(1);

    expect(result).toBeDefined();
  });
});
```

### 2. Test Service Contracts

Test the contracts, not the implementations.

```typescript
// ✅ Good - Test the contract
describe('IUserRepository', () => {
  let userRepo: IUserRepository;

  beforeEach(() => {
    userRepo = new MockUserRepository();
  });

  it('should find user by id', async () => {
    const user = await userRepo.findById(1);
    expect(user).toBeDefined();
    expect(user.id).toBe(1);
  });

  it('should save user', async () => {
    const user = { id: 1, name: 'Luke' };
    await expect(userRepo.save(user)).resolves.not.toThrow();
  });
});

// ❌ Bad - Test implementation details
describe('DatabaseUserRepository', () => {
  it('should execute SQL query', async () => {
    const repo = new DatabaseUserRepository();
    const spy = jest.spyOn(repo, 'executeQuery');

    await repo.findById(1);

    expect(spy).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
  });
});
```

## 🚀 Performance Best Practices

### 1. Lazy Loading

Use lazy loading for expensive services.

```typescript
// ✅ Good - Lazy loading
@Service()
class ExpensiveService {
  private data: any;

  async getData() {
    if (!this.data) {
      this.data = await this.loadExpensiveData();
    }
    return this.data;
  }

  private async loadExpensiveData() {
    // Expensive operation
  }
}

// ❌ Bad - Eager loading
@Service()
class ExpensiveService {
  private data: any;

  constructor() {
    this.data = this.loadExpensiveData(); // Loads immediately
  }
}
```

### 2. Service Caching

Leverage service caching for performance.

```typescript
// ✅ Good - Cached services
container.set('userService', () => new UserService());
const userService1 = container.get('userService');
const userService2 = container.get('userService');
// userService1 === userService2 (same instance)

// ❌ Bad - New instance every time
container.set('userService', () => new UserService());
const userService1 = container.get('userService');
container.set('userService', () => new UserService()); // Overwrites previous
const userService2 = container.get('userService');
// userService1 !== userService2 (different instances)
```

### 3. Batch Operations

Use batch operations when possible.

```typescript
// ✅ Good - Batch operations
container.setMany({
  userService: () => new UserService(),
  orderService: () => new OrderService(),
  paymentService: () => new PaymentService(),
});

// ❌ Bad - Individual operations
container.set('userService', () => new UserService());
container.set('orderService', () => new OrderService());
container.set('paymentService', () => new PaymentService());
```

## 🔍 Error Handling

### 1. Graceful Degradation

Handle errors gracefully and provide fallbacks.

```typescript
// ✅ Good - Graceful error handling
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: IUserRepository,
    @Inject() private cacheService: ICacheService
  ) {}

  async getUser(id: number) {
    try {
      return await this.userRepo.findById(id);
    } catch (error) {
      // Try cache as fallback
      const cached = await this.cacheService.get(`user:${id}`);
      if (cached) {
        return cached;
      }

      // Log error and rethrow
      this.logger.error('Failed to get user', { id, error });
      throw error;
    }
  }
}

// ❌ Bad - No error handling
@Service()
class UserService {
  constructor(@Inject() private userRepo: IUserRepository) {}

  async getUser(id: number) {
    return await this.userRepo.findById(id); // No error handling
  }
}
```

### 2. Specific Error Types

Use specific error types for different scenarios.

```typescript
// ✅ Good - Specific error types
try {
  const user = await userService.getUser(id);
} catch (error) {
  if (error instanceof UserNotFoundError) {
    return { error: 'User not found' };
  } else if (error instanceof DatabaseConnectionError) {
    return { error: 'Service temporarily unavailable' };
  } else {
    return { error: 'Internal server error' };
  }
}

// ❌ Bad - Generic error handling
try {
  const user = await userService.getUser(id);
} catch (error) {
  return { error: 'Something went wrong' }; // Too generic
}
```

## 📚 Documentation Best Practices

### 1. Document Public APIs

Document all public methods and properties.

```typescript
/**
 * Service for managing user operations
 */
@Service()
class UserService {
  /**
   * Retrieves a user by their ID
   * @param id - The user ID
   * @returns Promise that resolves to the user or null if not found
   * @throws {UserNotFoundError} When user doesn't exist
   */
  async getUser(id: number): Promise<User | null> {
    // Implementation
  }
}
```

### 2. Provide Examples

Include usage examples in your documentation.

````typescript
/**
 * Example usage:
 * ```typescript
 * const userService = container.get('userService');
 * const user = await userService.getUser(1);
 * console.log(user.name);
 * ```
 */
````

## 🎯 Common Anti-Patterns

### 1. Service Locator Pattern

Don't use the service locator pattern.

```typescript
// ❌ Bad - Service locator pattern
@Service()
class UserService {
  async getUser(id: number) {
    const db = container.get('database'); // Don't do this
    const email = container.get('emailService'); // Don't do this
    // ...
  }
}

// ✅ Good - Dependency injection
@Service()
class UserService {
  constructor(
    @Inject() private db: IDatabase,
    @Inject() private email: IEmailService
  ) {}

  async getUser(id: number) {
    // Use injected dependencies
  }
}
```

### 2. God Services

Don't create services that do everything.

```typescript
// ❌ Bad - God service
@Service()
class ApplicationService {
  async handleUserRequest() {
    /* user logic */
  }
  async processPayment() {
    /* payment logic */
  }
  async sendEmail() {
    /* email logic */
  }
  async logActivity() {
    /* logging logic */
  }
  async cacheData() {
    /* caching logic */
  }
}

// ✅ Good - Focused services
@Service()
class UserService {
  async handleUserRequest() {
    /* user logic */
  }
}

@Service()
class PaymentService {
  async processPayment() {
    /* payment logic */
  }
}

@Service()
class EmailService {
  async sendEmail() {
    /* email logic */
  }
}
```

### 3. Circular Dependencies

Avoid circular dependencies between services.

```typescript
// ❌ Bad - Circular dependency
@Service()
class UserService {
  constructor(@Inject() private orderService: OrderService) {}
}

@Service()
class OrderService {
  constructor(@Inject() private userService: UserService) {}
}

// ✅ Good - Break the cycle
@Service()
class UserService {
  constructor(@Inject() private eventBus: IEventBus) {}

  async getUser(id: number) {
    const user = await this.loadUser(id);
    this.eventBus.emit('user.loaded', user);
    return user;
  }
}

@Service()
class OrderService {
  constructor(@Inject() private eventBus: IEventBus) {
    this.eventBus.on('user.loaded', this.handleUserLoaded.bind(this));
  }
}
```

## 🚀 Next Steps

Ready to apply these best practices?

- **[Testing](/docs/testing)** - Learn testing strategies
- **[Performance](../advanced/performance)** - Optimize your application
- **[Advanced Patterns](/docs/advanced)** - Explore advanced techniques
- **[FAQ](/docs/faq)** - Find answers to common questions

---

**Ready to write better code?** Let's explore [Testing](/docs/testing) to learn how to test your dependency injection setup! 🚀
