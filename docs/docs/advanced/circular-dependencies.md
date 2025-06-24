---
sidebar_position: 9
---

# Circular Dependencies 🔄

Learn how to identify, prevent, and resolve circular dependencies in NexusDI. Like a recursive function without a base case, circular dependencies will bring your application to a halt.

> See also: [Debugging](debugging-and-diagnostics.md), [Concepts](../concepts.md)

## What Are Circular Dependencies?

A circular dependency occurs when two or more services depend on each other, either directly or indirectly. This creates a dependency cycle that the container cannot resolve.

```typescript
// ❌ Direct circular dependency
@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(EMAIL_SERVICE) private email: IEmailService) {}
}

@Service(EMAIL_SERVICE)
class EmailService {
  constructor(@Inject(USER_SERVICE) private user: IUserService) {} // Circular!
}
```

## Detecting Circular Dependencies

### Runtime Detection

NexusDI automatically detects circular dependencies and throws descriptive errors:

```typescript
// This will throw: "Circular dependency detected: USER_SERVICE → EMAIL_SERVICE → USER_SERVICE"
try {
  const userService = container.get(USER_SERVICE);
} catch (error) {
  console.error('Circular dependency detected:', error.message);
}
```

### Manual Detection

```typescript
// Check for circular dependencies manually
function detectCircularDependency(container: Nexus, startToken: TokenType): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function dfs(token: TokenType): boolean {
    const tokenName = token.toString();
    
    if (recursionStack.has(tokenName)) {
      return true; // Found a cycle
    }
    
    if (visited.has(tokenName)) {
      return false; // Already visited, no cycle
    }
    
    visited.add(tokenName);
    recursionStack.add(tokenName);
    
    // Check dependencies (simplified)
    const dependencies = getDependencies(container, token);
    for (const dep of dependencies) {
      if (dfs(dep)) return true;
    }
    
    recursionStack.delete(tokenName);
    return false;
  }
  
  return dfs(startToken);
}

// Usage
if (detectCircularDependency(container, USER_SERVICE)) {
  console.error('Circular dependency detected!');
}
```

## Solutions

### 1. Dependency Inversion (Recommended)

Extract shared interfaces and depend on abstractions:

```typescript
// ✅ Good - Use interfaces to break the cycle
interface IUserRepository {
  findById(id: string): Promise<User>;
}

interface IEmailService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(USER_REPOSITORY) private userRepo: IUserRepository,
    @Inject(EMAIL_SERVICE) private email: IEmailService
  ) {}
}

@Service(EMAIL_SERVICE)
class EmailService {
  constructor(
    @Inject(LOGGER) private logger: ILogger,
    @Inject(EMAIL_CONFIG) private config: IEmailConfig
  ) {} // No dependency on UserService
}
```

### 2. Event-Driven Communication

Use events to decouple services:

```typescript
// ✅ Good - Use events instead of direct dependencies
@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(USER_REPOSITORY) private userRepo: IUserRepository,
    @Inject(EVENT_BUS) private eventBus: IEventBus
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    const user = await this.userRepo.create(userData);
    this.eventBus.emit('user.created', { userId: user.id, email: user.email });
    return user;
  }
}

@Service(EMAIL_SERVICE)
class EmailService {
  constructor(@Inject(EVENT_BUS) private eventBus: IEventBus) {
    this.eventBus.on('user.created', this.handleUserCreated.bind(this));
  }

  private async handleUserCreated(data: { userId: string; email: string }) {
    await this.sendWelcomeEmail(data.email);
  }
}
```

### 3. Interface Segregation

Break large interfaces into smaller, focused ones:

```typescript
// ✅ Good - Split interfaces to avoid circular dependencies
interface IUserReader {
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User>;
}

interface IUserWriter {
  create(userData: CreateUserData): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User>;
}

@Service(USER_SERVICE)
class UserService {
  constructor(
    @Inject(USER_REPOSITORY) private userRepo: IUserReader & IUserWriter,
    @Inject(EMAIL_SENDER) private emailSender: IEmailSender
  ) {}
}

@Service(EMAIL_SERVICE)
class EmailService {
  constructor(
    @Inject(EMAIL_CONFIG) private config: IEmailConfig,
    @Inject(USER_READER) private userReader: IUserReader // Only depends on read operations
  ) {}
}
```

## Prevention Strategies

- **Single Responsibility Principle**: Each service should have one reason to change
- **Dependency Inversion**: Depend on abstractions, not concretions
- **Interface Segregation**: Use small, focused interfaces
- **Event-Driven Architecture**: Use events for communication
- **CQRS**: Separate read and write operations

## Testing Circular Dependencies

```typescript
describe('Circular Dependency Detection', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('should detect circular dependencies', () => {
    container.set(A_SERVICE, { useClass: ServiceA });
    container.set(B_SERVICE, { useClass: ServiceB });

    expect(() => {
      container.get(A_SERVICE);
    }).toThrow('Circular dependency detected');
  });

  it('should resolve services without circular dependencies', () => {
    container.set(USER_SERVICE, { useClass: UserService });
    container.set(EMAIL_SERVICE, { useClass: EmailService });

    expect(() => {
      container.get(USER_SERVICE);
    }).not.toThrow();
  });
});
```

## Next Steps

- **[Debugging](debugging-and-diagnostics.md)** - How to debug circular dependency issues
- **[Performance Tuning](performance-tuning.md)** - Optimize container performance
- **[Testing](../testing.md)** - Test your dependency injection setup

Remember: Design your services with clear boundaries and loose coupling to avoid circular dependency traps! 🔄✨ 