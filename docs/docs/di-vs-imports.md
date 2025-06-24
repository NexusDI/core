---
sidebar_position: 4
---

# DI vs Regular Imports: When to Use Each

Understanding when to use Dependency Injection versus regular imports is crucial for making the right architectural decisions in your projects. It's like choosing between a basic hand tool and a full workshop - both have their place, but knowing when to use each makes all the difference.

## Regular Imports Approach

```typescript
// Traditional approach with direct imports
import { PostgresDatabase } from './database/postgres';
import { ConsoleLogger } from './logging/console';
import { GmailEmailService } from './email/gmail';

class UserService {
  private database = new PostgresDatabase();
  private logger = new ConsoleLogger();
  private emailService = new GmailEmailService();
  
  async createUser(userData: UserData) {
    this.logger.info('Creating user');
    const user = await this.database.createUser(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

## Dependency Injection Approach

```typescript
// DI approach with tokens and injection
export const DATABASE = new Token<IDatabase>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');
export const EMAIL_SERVICE = new Token<IEmailService>('EMAIL_SERVICE');

@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger,
    @Inject(EMAIL_SERVICE) private emailService: IEmailService
  ) {}
  
  async createUser(userData: UserData) {
    this.logger.info('Creating user');
    const user = await this.database.createUser(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

## Comparison: Benefits and Drawbacks

### Regular Imports

**✅ Benefits:**
- **Simple and familiar**: Standard JavaScript/TypeScript pattern
- **No setup required**: Works out of the box
- **Clear dependencies**: Easy to see what a class depends on
- **Fast startup**: No container initialization overhead
- **Bundle size**: No additional DI library code
- **IDE support**: Excellent autocomplete and refactoring support

**❌ Drawbacks:**
- **Hard to test**: Difficult to mock dependencies
- **Tight coupling**: Classes are bound to specific implementations
- **Configuration inflexibility**: Can't easily switch implementations
- **Complex initialization**: Managing object creation and lifecycle
- **Difficult to mock**: Need to modify source code or use complex mocking libraries
- **Environment switching**: Requires code changes for different environments

### Dependency Injection

**✅ Benefits:**
- **Excellent testability**: Easy to mock any dependency
- **Loose coupling**: Dependencies are abstracted through interfaces
- **Flexible configuration**: Easy to switch implementations
- **Environment-specific setups**: Different configs for dev/staging/prod
- **Centralized dependency management**: All dependencies in one place
- **Runtime configuration**: Can change behavior without code changes
- **Modular architecture**: Easy to compose and reuse modules

**❌ Drawbacks:**
- **Learning curve**: New concepts and patterns to understand
- **Setup overhead**: Requires container initialization
- **Runtime complexity**: Additional layer of abstraction
- **Bundle size**: Includes DI library code
- **Debugging complexity**: Stack traces may be deeper
- **Performance overhead**: Small runtime cost for dependency resolution

## When to Use Each Approach

### Use Regular Imports When:

- **Simple applications**: Small projects with minimal complexity
- **Static dependencies**: Dependencies that never change
- **Performance critical**: When every millisecond matters
- **Quick prototypes**: Rapid development and iteration
- **Single environment**: No need for different configurations
- **Team familiarity**: Team prefers simpler, more direct approaches

### Use Dependency Injection When:

- **Complex applications**: Large codebases with many dependencies
- **Testing is important**: High test coverage requirements
- **Multiple environments**: Different configs for dev/staging/prod
- **Team development**: Multiple developers working on the same codebase
- **Long-term maintenance**: Applications that need to evolve over time
- **Modular architecture**: Need to compose and reuse components
- **Configuration flexibility**: Need to switch implementations easily

## Migration Strategy

### Start Simple, Add DI Gradually

```typescript
// Phase 1: Start with regular imports
class UserService {
  private database = new PostgresDatabase();
  private logger = new ConsoleLogger();
}

// Phase 2: Add interfaces for better design
interface IDatabase { /* ... */ }
interface ILogger { /* ... */ }

class UserService {
  constructor(
    private database: IDatabase,
    private logger: ILogger
  ) {}
}

// Phase 3: Introduce DI container
const DATABASE = new Token<IDatabase>('DATABASE');
const LOGGER = new Token<ILogger>('LOGGER');

@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}
}
```

## Real-World Example

### E-commerce Application

**Without DI (Regular Imports):**
```typescript
// Hard to test, tightly coupled
class OrderService {
  private database = new PostgresDatabase();
  private paymentProcessor = new StripePaymentProcessor();
  private emailService = new SendGridEmailService();
  private logger = new WinstonLogger();
  
  async processOrder(order: Order) {
    // Business logic mixed with object creation
    this.logger.info('Processing order');
    const payment = await this.paymentProcessor.charge(order.total);
    await this.database.saveOrder(order);
    await this.emailService.sendConfirmation(order.email);
  }
}

// Testing is difficult
const orderService = new OrderService(); // Creates real dependencies
// Need to mock at module level or use complex mocking
```

**With DI (NexusDI):**
```typescript
// Easy to test, loosely coupled
const DATABASE = new Token<IDatabase>('DATABASE');
const PAYMENT_PROCESSOR = new Token<IPaymentProcessor>('PAYMENT_PROCESSOR');
const EMAIL_SERVICE = new Token<IEmailService>('EMAIL_SERVICE');
const LOGGER = new Token<ILogger>('LOGGER');

@Service(ORDER_SERVICE)
class OrderService implements IOrderService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(PAYMENT_PROCESSOR) private paymentProcessor: IPaymentProcessor,
    @Inject(EMAIL_SERVICE) private emailService: IEmailService,
    @Inject(LOGGER) private logger: ILogger
  ) {}
  
  async processOrder(order: Order) {
    // Pure business logic
    this.logger.info('Processing order');
    const payment = await this.paymentProcessor.charge(order.total);
    await this.database.saveOrder(order);
    await this.emailService.sendConfirmation(order.email);
  }
}

// Easy to test
const mockDatabase = { saveOrder: vi.fn() };
const mockPaymentProcessor = { charge: vi.fn() };
const mockEmailService = { sendConfirmation: vi.fn() };
const mockLogger = { info: vi.fn() };

nexus.set(DATABASE, { useValue: mockDatabase });
nexus.set(PAYMENT_PROCESSOR, { useValue: mockPaymentProcessor });
nexus.set(EMAIL_SERVICE, { useValue: mockEmailService });
nexus.set(LOGGER, { useValue: mockLogger });

const orderService = nexus.get(ORDER_SERVICE);
// Test with clean mocks
```

Sometimes you need to science the heck out of a complex problem, and sometimes you just need to duct tape a simple solution together! 🚀

## Decision Matrix

| Factor | Regular Imports | Dependency Injection |
|--------|----------------|---------------------|
| **Project Size** | Small to medium | Medium to large |
| **Team Size** | 1-3 developers | 3+ developers |
| **Testing Requirements** | Basic | Comprehensive |
| **Environment Count** | 1-2 | 3+ |
| **Maintenance Period** | Short-term | Long-term |
| **Performance Critical** | Yes | No |
| **Learning Curve** | Low | Medium |
| **Setup Time** | Minimal | Moderate |

## Hybrid Approach

You can also use a hybrid approach, starting with regular imports and gradually introducing DI where it makes sense:

```typescript
// Start with regular imports for simple services
class SimpleService {
  private calculator = new Calculator();
  
  add(a: number, b: number) {
    return this.calculator.add(a, b);
  }
}

// Use DI for complex services with many dependencies
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger,
    @Inject(EMAIL_SERVICE) private emailService: IEmailService
  ) {}
}
```

## Summary

Choose the right approach based on your project's needs:

- **Start simple** with regular imports for small projects
- **Add DI gradually** as complexity grows
- **Use DI from the start** for large, long-term projects
- **Consider team expertise** and project requirements
- **Balance simplicity** with flexibility and testability

Both approaches have their place in modern software development. The key is choosing the right tool for the job and your team's needs. 