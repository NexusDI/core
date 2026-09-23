---
sidebar_position: 6
title: 'Testing with Dependency Injection'
description: 'Master testing strategies with NexusDI. Learn how to write effective unit tests, integration tests, and E2E tests using dependency injection.'
tags:
  ['testing', 'unit-tests', 'integration-tests', 'mocking', 'test-containers']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🧪 Testing with Dependency Injection

Welcome to the testing guide for NexusDI! Just as a Jedi must practice their lightsaber techniques to master combat, you must master testing strategies to build reliable applications. This guide will teach you how to write effective tests using dependency injection patterns.

## 🎯 Why Testing with DI Matters

Dependency injection makes testing easier by:

- **Easy Mocking** - Replace dependencies with test doubles
- **Isolation** - Test services in isolation
- **Flexibility** - Configure different dependencies for different tests
- **Maintainability** - Tests are easier to maintain and update
- **Reliability** - More reliable and predictable tests

## 🚀 Unit Testing

### Basic Unit Test Setup

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Nexus } from 'nexusdi-core';

// Service to test
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private emailService: EmailService
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    const user = await this.userRepo.save(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }

  async getUser(id: number): Promise<User | null> {
    return await this.userRepo.findById(id);
  }
}

// Test setup
describe('UserService', () => {
  let container: Nexus;
  let userService: UserService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeEach(async () => {
    // Create fresh container for each test
    container = new Nexus();
    await container.init();

    // Create mocks
    mockUserRepo = {
      save: vi.fn(),
      findById: vi.fn(),
    } as jest.Mocked<UserRepository>;

    mockEmailService = {
      sendWelcomeEmail: vi.fn(),
    } as jest.Mocked<EmailService>;

    // Register mocks
    container.set('userRepository', mockUserRepo);
    container.set('emailService', mockEmailService);

    // Get service under test
    userService = await container.get('userService');
  });

  afterEach(async () => {
    await container.dispose();
  });

  describe('createUser', () => {
    it('should create user and send welcome email', async () => {
      // Arrange
      const userData = { name: 'John Doe', email: 'john@example.com' };
      const savedUser = { id: 1, ...userData };
      mockUserRepo.save.mockResolvedValue(savedUser);
      mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined);

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(mockUserRepo.save).toHaveBeenCalledWith(userData);
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'john@example.com'
      );
      expect(result).toEqual(savedUser);
    });

    it('should handle repository errors', async () => {
      // Arrange
      const userData = { name: 'John Doe', email: 'john@example.com' };
      const error = new Error('Database connection failed');
      mockUserRepo.save.mockRejectedValue(error);

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow(
        'Database connection failed'
      );
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = 1;
      const user = { id: userId, name: 'John Doe', email: 'john@example.com' };
      mockUserRepo.findById.mockResolvedValue(user);

      // Act
      const result = await userService.getUser(userId);

      // Assert
      expect(mockUserRepo.findById).toHaveBeenCalledWith(userId);
      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      // Arrange
      const userId = 999;
      mockUserRepo.findById.mockResolvedValue(null);

      // Act
      const result = await userService.getUser(userId);

      // Assert
      expect(result).toBeNull();
    });
  });
});
```

### Testing with Mocks

```tsx
// Mock factory for common services
class MockFactory {
  static createUserRepository(): jest.Mocked<UserRepository> {
    return {
      save: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as jest.Mocked<UserRepository>;
  }

  static createEmailService(): jest.Mocked<EmailService> {
    return {
      sendWelcomeEmail: vi.fn(),
      sendPasswordReset: vi.fn(),
      sendNotification: vi.fn(),
    } as jest.Mocked<EmailService>;
  }

  static createPaymentService(): jest.Mocked<PaymentService> {
    return {
      processPayment: vi.fn(),
      refundPayment: vi.fn(),
      getPaymentStatus: vi.fn(),
    } as jest.Mocked<PaymentService>;
  }
}

// Test with mock factory
describe('OrderService', () => {
  let container: Nexus;
  let orderService: OrderService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockPaymentService: jest.Mocked<PaymentService>;

  beforeEach(async () => {
    container = new Nexus();
    await container.init();

    // Use mock factory
    mockUserRepo = MockFactory.createUserRepository();
    mockPaymentService = MockFactory.createPaymentService();

    container.set('userRepository', mockUserRepo);
    container.set('paymentService', mockPaymentService);

    orderService = await container.get('orderService');
  });

  it('should process order successfully', async () => {
    // Arrange
    const userId = 1;
    const orderData = { items: [{ productId: 1, quantity: 2 }], total: 100 };
    const user = { id: userId, email: 'user@example.com' };

    mockUserRepo.findById.mockResolvedValue(user);
    mockPaymentService.processPayment.mockResolvedValue('payment_123');

    // Act
    const result = await orderService.createOrder(userId, orderData);

    // Assert
    expect(mockUserRepo.findById).toHaveBeenCalledWith(userId);
    expect(mockPaymentService.processPayment).toHaveBeenCalledWith(
      100,
      expect.any(String)
    );
    expect(result.status).toBe('confirmed');
  });
});
```

## 🔧 Integration Testing

### Test Container Setup

```tsx
// Test container for integration tests
class TestContainer {
  private container: Nexus;
  private mocks: Map<string, any> = new Map();

  async setup(): Promise<void> {
    this.container = new Nexus();
    await this.container.init();
  }

  async teardown(): Promise<void> {
    await this.container.dispose();
  }

  // Register real services
  registerRealService<T>(token: string, service: T): void {
    this.container.set(token, service);
  }

  // Register mock services
  registerMockService<T>(token: string, mock: T): void {
    this.mocks.set(token, mock);
    this.container.set(token, mock);
  }

  // Get service
  async getService<T>(token: string): Promise<T> {
    return await this.container.get(token);
  }

  // Replace service with mock
  replaceWithMock<T>(token: string, mock: T): void {
    this.mocks.set(token, mock);
    this.container.set(token, mock);
  }
}

// Integration test example
describe('UserService Integration', () => {
  let testContainer: TestContainer;
  let userService: UserService;
  let realDatabase: DatabaseService;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeAll(async () => {
    testContainer = new TestContainer();
    await testContainer.setup();

    // Use real database for integration tests
    realDatabase = new DatabaseService();
    await realDatabase.connect({
      host: 'localhost',
      port: 5432,
      database: 'test_db',
    });

    testContainer.registerRealService('databaseService', realDatabase);

    // Mock external services
    mockEmailService = MockFactory.createEmailService();
    testContainer.registerMockService('emailService', mockEmailService);

    userService = await testContainer.getService('userService');
  });

  afterAll(async () => {
    await testContainer.teardown();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await realDatabase.query('DELETE FROM users');
  });

  it('should create user and save to database', async () => {
    // Arrange
    const userData = { name: 'John Doe', email: 'john@example.com' };

    // Act
    const user = await userService.createUser(userData);

    // Assert
    expect(user.id).toBeDefined();
    expect(user.name).toBe(userData.name);
    expect(user.email).toBe(userData.email);

    // Verify in database
    const savedUser = await realDatabase.query(
      'SELECT * FROM users WHERE id = ?',
      [user.id]
    );
    expect(savedUser).toHaveLength(1);
    expect(savedUser[0].name).toBe(userData.name);

    // Verify email was sent
    expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
      userData.email
    );
  });
});
```

### Database Integration Tests

```tsx
// Database integration test helper
class DatabaseTestHelper {
  private container: Nexus;
  private database: DatabaseService;

  async setup(): Promise<void> {
    this.container = new Nexus();
    await this.container.init();

    this.database = new DatabaseService();
    await this.database.connect({
      host: 'localhost',
      port: 5432,
      database: 'test_db',
    });

    this.container.set('databaseService', this.database);
  }

  async teardown(): Promise<void> {
    await this.database.dispose();
    await this.container.dispose();
  }

  async cleanDatabase(): Promise<void> {
    await this.database.query('DELETE FROM users');
    await this.database.query('DELETE FROM orders');
    await this.database.query('DELETE FROM products');
  }

  async seedTestData(): Promise<void> {
    await this.database.query('INSERT INTO users (name, email) VALUES (?, ?)', [
      'Test User',
      'test@example.com',
    ]);
  }
}

// Database integration tests
describe('UserRepository Integration', () => {
  let testHelper: DatabaseTestHelper;
  let userRepo: UserRepository;

  beforeAll(async () => {
    testHelper = new DatabaseTestHelper();
    await testHelper.setup();
    userRepo = await testHelper.container.get('userRepository');
  });

  afterAll(async () => {
    await testHelper.teardown();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
  });

  it('should save and retrieve user', async () => {
    // Arrange
    const userData = { name: 'John Doe', email: 'john@example.com' };

    // Act
    const savedUser = await userRepo.save(userData);
    const retrievedUser = await userRepo.findById(savedUser.id);

    // Assert
    expect(savedUser.id).toBeDefined();
    expect(retrievedUser).toEqual(savedUser);
  });

  it('should find user by email', async () => {
    // Arrange
    const userData = { name: 'Jane Doe', email: 'jane@example.com' };
    await userRepo.save(userData);

    // Act
    const foundUser = await userRepo.findByEmail('jane@example.com');

    // Assert
    expect(foundUser).toBeDefined();
    expect(foundUser?.email).toBe('jane@example.com');
  });
});
```

## 🎭 E2E Testing

### End-to-End Test Setup

```tsx
// E2E test setup
class E2ETestSetup {
  private container: Nexus;
  private app: Express;
  private server: Server;

  async setup(): Promise<void> {
    // Create container with real services
    this.container = new Nexus();
    await this.container.init();

    // Register real services
    this.container.set('databaseService', new DatabaseService());
    this.container.set('emailService', new EmailService());
    this.container.set('paymentService', new PaymentService());

    // Register modules
    this.container.set('userModule', () => new UserModule());
    this.container.set('orderModule', () => new OrderModule());

    // Create Express app
    this.app = express();
    this.app.use(express.json());

    // Set up routes
    this.setupRoutes();

    // Start server
    this.server = this.app.listen(0);
  }

  async teardown(): Promise<void> {
    this.server.close();
    await this.container.dispose();
  }

  private setupRoutes(): void {
    const userController = this.container.get('userController');
    const orderController = this.container.get('orderController');

    this.app.get(
      '/users/:id',
      userController.handleGetUser.bind(userController)
    );
    this.app.post(
      '/users',
      userController.handleCreateUser.bind(userController)
    );
    this.app.post(
      '/orders',
      orderController.handleCreateOrder.bind(orderController)
    );
  }

  getBaseUrl(): string {
    const address = this.server.address();
    return `http://localhost:${address.port}`;
  }
}

// E2E tests
describe('E2E Tests', () => {
  let testSetup: E2ETestSetup;
  let baseUrl: string;

  beforeAll(async () => {
    testSetup = new E2ETestSetup();
    await testSetup.setup();
    baseUrl = testSetup.getBaseUrl();
  });

  afterAll(async () => {
    await testSetup.teardown();
  });

  it('should create user and place order', async () => {
    // Create user
    const userResponse = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
      }),
    });

    expect(userResponse.status).toBe(200);
    const user = await userResponse.json();

    // Place order
    const orderResponse = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.data.id,
        items: [{ productId: 1, quantity: 2 }],
        cardToken: 'tok_test_123',
      }),
    });

    expect(orderResponse.status).toBe(200);
    const order = await orderResponse.json();
    expect(order.data.status).toBe('confirmed');
  });
});
```

## 🔧 Testing Utilities

### Test Helper Functions

```tsx
// Test utilities
export class TestUtils {
  // Create test container with mocks
  static async createTestContainer(
    mocks: Record<string, any> = {}
  ): Promise<Nexus> {
    const container = new Nexus();
    await container.init();

    // Register mocks
    for (const [token, mock] of Object.entries(mocks)) {
      container.set(token, mock);
    }

    return container;
  }

  // Create mock service
  static createMockService<T>(methods: (keyof T)[]): jest.Mocked<T> {
    const mock = {} as jest.Mocked<T>;

    for (const method of methods) {
      mock[method] = vi.fn();
    }

    return mock;
  }

  // Wait for async operations
  static async waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Create test data
  static createTestUser(overrides: Partial<User> = {}): User {
    return {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      ...overrides,
    };
  }
}

// Usage in tests
describe('Service Tests', () => {
  it('should work with test utilities', async () => {
    const mockRepo = TestUtils.createMockService<UserRepository>([
      'save',
      'findById',
    ]);
    const container = await TestUtils.createTestContainer({
      userRepository: mockRepo,
    });

    const userService = await container.get('userService');
    const testUser = TestUtils.createTestUser();

    mockRepo.save.mockResolvedValue(testUser);

    const result = await userService.createUser(testUser);
    expect(result).toEqual(testUser);
  });
});
```

## 🎯 Best Practices

### 1. Use AAA Pattern

```tsx
// ✅ Good - Arrange, Act, Assert
it('should create user', async () => {
  // Arrange
  const userData = { name: 'John', email: 'john@example.com' };
  mockRepo.save.mockResolvedValue({ id: 1, ...userData });

  // Act
  const result = await userService.createUser(userData);

  // Assert
  expect(result.id).toBe(1);
  expect(mockRepo.save).toHaveBeenCalledWith(userData);
});
```

### 2. Test Error Cases

```tsx
// ✅ Good - Test error scenarios
it('should handle database errors', async () => {
  // Arrange
  const userData = { name: 'John', email: 'john@example.com' };
  const error = new Error('Database connection failed');
  mockRepo.save.mockRejectedValue(error);

  // Act & Assert
  await expect(userService.createUser(userData)).rejects.toThrow(
    'Database connection failed'
  );
});
```

### 3. Use Descriptive Test Names

```tsx
// ✅ Good - Descriptive test names
it('should send welcome email when user is created successfully', async () => {
  // Test implementation
});

// ❌ Bad - Vague test names
it('should work', async () => {
  // Test implementation
});
```

### 4. Clean Up Resources

```tsx
// ✅ Good - Proper cleanup
afterEach(async () => {
  await container.dispose();
});

// ❌ Bad - No cleanup
afterEach(() => {
  // No cleanup - memory leaks
});
```

## 🔍 Troubleshooting

### Common Testing Issues

**Mocks not working:**

```tsx
// Make sure to register mocks before getting services
container.set('userRepository', mockRepo);
const userService = await container.get('userService');
```

**Async operations not completing:**

```tsx
// Use proper async/await
it('should handle async operations', async () => {
  const result = await userService.createUser(userData);
  expect(result).toBeDefined();
});
```

**Container not disposing:**

```tsx
// Always dispose containers in tests
afterEach(async () => {
  await container.dispose();
});
```

## 🎯 Next Steps

Ready to master testing with NexusDI?

- **[Best Practices](/docs/best-practices)** - Follow proven patterns
- **[Advanced Patterns](/docs/advanced)** - Explore advanced techniques
- **[Real-World Examples](/docs/examples/real-world-scenarios)** - See testing in action
- **[API Reference](/docs/api-reference)** - Explore the full API

---

**Need help with testing?** Check out [Best Practices](/docs/best-practices) to learn proven testing patterns! 🚀
