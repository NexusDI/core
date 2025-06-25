---
sidebar_position: 1
---

# Nexus Class

The `Nexus` class is the core dependency injection container in NexusDI - think of it as your application's central nervous system, coordinating all the different parts and making sure they can communicate effectively. It's responsible for registering providers, resolving dependencies, and managing the entire dependency injection lifecycle.

## What is the Nexus Container?

The `Nexus` container is the heart of your dependency injection setup. It acts as a registry and factory that:

- **Registers providers** (services, values, factories)
- **Resolves dependencies** and injects them into classes
- **Manages module registration** and configuration
- **Supports advanced features** like child containers and dynamic modules

You'll typically create a single `Nexus` container instance for your application, or one per request in server-side scenarios.

## Basic Usage

### Creating a Container

```typescript
import { Nexus } from '@nexusdi/core';

// Create a new container instance
const container = new Nexus();
```

### Registering Services

```typescript
import { Nexus, Service, Token, Inject } from '@nexusdi/core';

// Define tokens
const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
const DATABASE = new Token<IDatabase>('DATABASE');

// Create services with dependencies
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(DATABASE) private db: IDatabase) {}

  async getUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

// Register in container
const container = new Nexus();
container.set(USER_SERVICE, { useClass: UserService });
container.set(DATABASE, { useClass: PostgresDatabase });
```

### Resolving Dependencies

```typescript
// Get an instance with all dependencies injected
const userService = container.get(USER_SERVICE);

// Use the service
const user = await userService.getUser('123');
```

## Container Lifecycle

### 1. **Registration Phase**

Register all your services, providers, and modules:

```typescript
const container = new Nexus();

// Register individual providers
container.set(USER_SERVICE, { useClass: UserService });
container.set(EMAIL_SERVICE, { useClass: EmailService });

// Register modules
container.set(UserModule);
container.set(EmailModule);
```

### 2. **Resolution Phase**

Resolve and use your services:

```typescript
// Services are created on-demand with dependencies injected
const userService = container.get(USER_SERVICE);
const emailService = container.get(EMAIL_SERVICE);

// Use the services
await userService.createUser(userData);
await emailService.sendWelcomeEmail(user.email);
```

### 3. **Cleanup Phase**

Clean up when done:

```typescript
// Clear all registrations and instances
container.clear();
```

## Advanced Features

### Child Containers

Create child containers that inherit from a parent:

```typescript
const parentContainer = new Nexus();
parentContainer.set(DATABASE, { useClass: PostgresDatabase });

// Create child container for request-scoped services
const requestContainer = parentContainer.createChildContainer();
requestContainer.set(USER_SERVICE, { useClass: UserService });

// Child has access to parent's services
const userService = requestContainer.get(USER_SERVICE);
const database = requestContainer.get(DATABASE); // From parent
```

### Module Registration

Register entire modules at once:

```typescript
@Module({
  services: [UserService, UserRepository],
  providers: [{ token: DATABASE, useClass: PostgresDatabase }],
})
class UserModule {}

const container = new Nexus();
container.set(UserModule); // Registers all services and providers
```

### Dynamic Module Configuration

<details>
<summary>⚠️ Planned Feature - Currently Non-Functional</summary>

Dynamic module configuration with `.config()` methods is planned for future releases.

```typescript
@Module({
  services: [DatabaseService],
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
}

const container = new Nexus();

// Configure with different settings
container.set(
  DatabaseModule.config({
    host: 'localhost',
    port: 5432,
    database: 'myapp',
  })
);
```

</details>

For now, you can achieve similar functionality using environment-specific modules:

```typescript
@Module({
  services: [DatabaseService],
  providers: [
    {
      token: DATABASE_CONFIG,
      useValue: {
        host: 'localhost',
        port: 5432,
        database: 'myapp',
      },
    },
  ],
})
class DatabaseModule {}

const container = new Nexus();
container.set(DatabaseModule); // Registers all services and providers
```

## Best Practices

### 1. **Single Container Per Application**

```typescript
// ✅ Good - One container for the entire app
const appContainer = new Nexus();
appContainer.set(AppModule);

// ❌ Bad - Multiple containers doing the same thing
const userContainer = new Nexus();
const emailContainer = new Nexus();
```

### 2. **Request-Scoped Child Containers**

```typescript
// ✅ Good - Child containers for request scope
const appContainer = new Nexus();
appContainer.set(AppModule);

// For each request
const requestContainer = appContainer.createChildContainer();
requestContainer.set(REQUEST_ID, { useValue: generateRequestId() });
```

### 3. **Early Registration**

```typescript
// ✅ Good - Register everything upfront
const container = new Nexus();
container.set(UserModule);
container.set(EmailModule);
container.set(DatabaseModule);

// Start the application
const app = container.get(APP_SERVICE);
app.start();

// ❌ Bad - Registering during runtime
const container = new Nexus();
const app = container.get(APP_SERVICE); // Might fail if dependencies aren't registered
```

### 4. **Error Handling**

```typescript
// Check if a service is registered
if (container.has(USER_SERVICE)) {
  const userService = container.get(USER_SERVICE);
}

// Handle missing dependencies gracefully
try {
  const userService = container.get(USER_SERVICE);
} catch (error) {
  console.error('UserService not registered:', error);
}
```

## Performance Considerations

### Startup Performance

- **Fast registration**: ~0.16μs per provider
- **Efficient resolution**: ~0.2μs per service
- **Minimal memory overhead**: ~6KB additional heap

### Memory Management

```typescript
// Container instances are lightweight
const container = new Nexus(); // ~1KB memory

// Services are cached after first creation
const service1 = container.get(USER_SERVICE); // Creates instance
const service2 = container.get(USER_SERVICE); // Returns cached instance

// Clear when done to free memory
container.clear();
```

## Common Patterns

### Application Bootstrap

```typescript
// Bootstrap your application
async function bootstrap() {
  const container = new Nexus();

  // Register all modules
  container.set(DatabaseModule);
  container.set(UserModule);
  container.set(EmailModule);

  // Get the main application service
  const app = container.get(APP_SERVICE);

  // Start the application
  await app.start();

  return container;
}

// Usage
const container = await bootstrap();
```

### Testing Setup

```typescript
describe('UserService', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();

    // Register test dependencies
    container.set(DATABASE, { useValue: mockDatabase });
    container.set(USER_SERVICE, { useClass: UserService });
  });

  afterEach(() => {
    container.clear();
  });

  it('should create user', async () => {
    const userService = container.get(USER_SERVICE);
    const result = await userService.createUser(userData);
    expect(result).toBeDefined();
  });
});
```

## Next Steps

- **[API Reference](api-reference.md)** - Complete method reference and examples
- **[Modules](../modules/module-basics.md)** - Organize services into modules
- **[Testing](../testing.md)** - How to test with the container
- **[Advanced](../advanced/advanced.md)** - Advanced container patterns and techniques

The `
