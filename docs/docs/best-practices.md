---
sidebar_position: 5
---

# Best Practices 🎯

Following best practices ensures your NexusDI implementation is maintainable, testable, and scalable.

## 1. Keep Dependencies Minimal

Keep your dependencies focused and purposeful:

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
    @Inject(NOTIFICATION_SERVICE)
    private notificationService: INotificationService
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

## 2. Use Meaningful Token Names

Your tokens should be clear and descriptive:

```typescript
// ❌ Unclear tokens
const DB = new Token();
const LOG = new Token();

// ✅ Clear, descriptive tokens
export const DATABASE = new Token<DataSource>('DATABASE');
export const LOGGER = new Token<ILogger>('LOGGER');
```

## 3. Group Related Services in Modules

Keep your code organized and modular:

```typescript
@Module({
  providers: [UserService, UserRepository, UserValidator],
})
class UserModule {}
```

## 4. Export Tokens and Interfaces

Share your tokens and interfaces with your team:

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

## 5. Use Strong Typing

TypeScript is here to help - let it do its job:

```typescript
// ✅ Good - strong typing
interface IUserService {
  getUser(id: string): Promise<User>;
  createUser(user: CreateUserDto): Promise<User>;
  updateUser(id: string, user: UpdateUserDto): Promise<User>;
}

export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');

// ❌ Bad - weak typing
export const USER_SERVICE = new Token<any>('USER_SERVICE');
```

## 6. Organize Tokens by Domain

Group related tokens together for better organization:

```typescript
// tokens/user.tokens.ts
export const USER_SERVICE = new Token<IUserService>('USER_SERVICE');
export const USER_REPOSITORY = new Token<IUserRepository>('USER_REPOSITORY');
export const USER_VALIDATOR = new Token<IUserValidator>('USER_VALIDATOR');

// tokens/database.tokens.ts
export const DATABASE = new Token<IDatabase>('DATABASE');
export const DATABASE_CONFIG = new Token<IDatabaseConfig>('DATABASE_CONFIG');
export const DATABASE_CONNECTION = new Token<IDatabaseConnection>(
  'DATABASE_CONNECTION'
);
```

## 7. Use Factory Providers for Complex Dependencies

Use factories when you need custom instantiation logic:

```typescript
// ✅ Good - factory for complex initialization
nexus.set(DATABASE, {
  useFactory: (config: IDatabaseConfig, logger: ILogger) => {
    if (config.type === 'postgres') {
      return new PostgresDatabase(config, logger);
    } else if (config.type === 'mysql') {
      return new MySQLDatabase(config, logger);
    } else {
      return new InMemoryDatabase(logger);
    }
  },
  deps: [DATABASE_CONFIG, LOGGER],
});

// ❌ Bad - hardcoded implementation
nexus.set(DATABASE, { useClass: PostgresDatabase });
```

## 8. Implement Proper Error Handling

Good error handling is essential for robust applications:

```typescript
// ✅ Good - proper error handling
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async getUser(id: string): Promise<User> {
    try {
      this.logger.info(`Fetching user with id: ${id}`);
      const user = await this.database.query(
        `SELECT * FROM users WHERE id = ?`,
        [id]
      );

      if (!user) {
        throw new Error(`User not found: ${id}`);
      }

      return user;
    } catch (error) {
      this.logger.error(`Failed to fetch user ${id}:`, error);
      throw error;
    }
  }
}
```

## 9. Use Async Factories for Database Connections

Some things take time, and that's okay:

```typescript
// ✅ Good - async factory for database connection
nexus.set(DATABASE, {
  useFactoryAsync: async (config: IDatabaseConfig) => {
    const connection = await createDatabaseConnection(config);
    return new Database(connection);
  },
  deps: [DATABASE_CONFIG],
});
```

## 10. Implement Service Lifecycle Management

Be a good citizen - clean up after yourself:

```typescript
// ✅ Good - lifecycle management
@Service(USER_SERVICE)
class UserService implements IUserService, OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(DATABASE) private database: IDatabase,
    @Inject(LOGGER) private logger: ILogger
  ) {}

  async onModuleInit() {
    this.logger.info('UserService initialized');
    await this.database.connect();
  }

  async onModuleDestroy() {
    this.logger.info('UserService shutting down');
    await this.database.disconnect();
  }
}
```

## 11. Use Environment-Specific Configuration

```typescript
// ✅ Good - environment-specific configuration
const getDatabaseProvider = () => {
  switch (process.env.NODE_ENV) {
    case 'production':
      return { useClass: PostgresDatabase };
    case 'test':
      return { useClass: InMemoryDatabase };
    default:
      return { useClass: SQLiteDatabase };
  }
};

nexus.set(DATABASE, getDatabaseProvider());
```

## 12. Implement Proper Testing Patterns

```typescript
// ✅ Good - testing with mocks
describe('UserService', () => {
  let nexus: Nexus;
  let userService: IUserService;
  let mockDatabase: jest.Mocked<IDatabase>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    nexus = new Nexus();

    mockDatabase = {
      query: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    nexus.set(DATABASE, { useValue: mockDatabase });
    nexus.set(LOGGER, { useValue: mockLogger });

    userService = nexus.get(USER_SERVICE);
  });

  it('should fetch user by id', async () => {
    const mockUser = { id: '123', name: 'John' };
    mockDatabase.query.mockResolvedValue(mockUser);

    const result = await userService.getUser('123');

    expect(result).toEqual(mockUser);
    expect(mockDatabase.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE id = ?',
      ['123']
    );
  });
});
```

## 13. Use Dependency Validation

```typescript
// ✅ Good - validate required dependencies
function validateDependencies(nexus: Nexus, requiredTokens: Token<any>[]) {
  const missing = requiredTokens.filter((token) => !nexus.has(token));

  if (missing.length > 0) {
    throw new Error(
      `Missing required dependencies: ${missing
        .map((t) => t.toString())
        .join(', ')}`
    );
  }
}

// Usage in application startup
validateDependencies(nexus, [DATABASE, LOGGER, EMAIL_SERVICE]);
```

## 14. Implement Circular Dependency Prevention

```typescript
// ❌ Bad - circular dependency
@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(ORDER_SERVICE) private orderService: IOrderService) {}
}

@Service(ORDER_SERVICE)
class OrderService {
  constructor(@Inject(USER_SERVICE) private userService: IUserService) {}
}

// ✅ Good - break circular dependency with events or interfaces
@Service(USER_SERVICE)
class UserService {
  constructor(@Inject(EVENT_BUS) private eventBus: IEventBus) {}

  async createUser(userData: UserData) {
    const user = await this.database.createUser(userData);
    this.eventBus.emit('user.created', user);
    return user;
  }
}

@Service(ORDER_SERVICE)
class OrderService {
  constructor(@Inject(EVENT_BUS) private eventBus: IEventBus) {
    this.eventBus.on('user.created', this.handleUserCreated.bind(this));
  }
}
```

## 15. Use Child Containers for Scoped Dependencies

```typescript
// ✅ Good - child containers for request-scoped dependencies
const requestContainer = nexus.createChildContainer();
requestContainer.set(REQUEST_ID, { useValue: generateRequestId() });
requestContainer.set(USER_CONTEXT, { useValue: extractUserFromRequest(req) });

// Use request-scoped services
const userService = requestContainer.get(USER_SERVICE);
```

## Summary

Following these best practices will help you:

- **Maintain clean, readable code** with proper organization
- **Ensure type safety** throughout your application
- **Make testing easier** with proper mocking patterns
- **Scale your application** as it grows in complexity
- **Avoid common pitfalls** like circular dependencies
- **Create maintainable** and long-lasting codebases

Remember that these are guidelines, not strict rules. Adapt them to your specific project needs and team preferences.

The best raids are the ones where everyone knows their role and works together. Your code should be no different - every service should have a clear purpose and work in harmony with the rest of your application! 🌟
