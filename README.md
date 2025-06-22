# NexusDI

A modern, lightweight dependency injection container for TypeScript with decorator support, inspired by NestJS and Angular.

## Features

- 🚀 **Modern TypeScript** - Built with TypeScript and decorators
- 🎯 **Type Safety** - Full type safety with generics and tokens
- 🔧 **Decorator Support** - Clean, declarative syntax with `@Service`, `@Module`, and `@Inject`
- 📦 **Module System** - Organize services into modules with imports and exports
- ⚡ **Dynamic Configuration** - Static methods for environment-specific module configuration (NestJS-style)
- 🔄 **Dependency Resolution** - Automatic dependency injection with constructor and property injection
- 🧪 **Testing Friendly** - Easy mocking and testing with child containers
- 📚 **Comprehensive Documentation** - Full API documentation and examples

## Quick Start

```bash
npm install @nexusdi/core
```

```typescript
import { Nexus, Service, Token, Inject } from '@nexusdi/core';

// Define service interface and token
interface IUserService {
  getUsers(): Promise<User[]>;
}
const USER_SERVICE = new Token<IUserService>('UserService');

// Create service with dependency injection
@Service(USER_SERVICE)
class UserService implements IUserService {
  constructor(@Inject(LOGGER_SERVICE) private logger: ILoggerService) {}
  
  async getUsers(): Promise<User[]> {
    this.logger.info('Fetching users');
    return [{ id: 1, name: 'John' }];
  }
}

// Use the container
const container = new Nexus();
container.registerModule(UserModule);
const userService = container.get(USER_SERVICE);
```

## Dynamic Module Configuration

NexusDI supports dynamic module configuration with a simple base class approach:

```typescript
import { Module, DynamicModule } from '@nexusdi/core';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
}

const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

@Module({
  services: [DatabaseService], // Simplified format - uses @Service decorator token
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
  database: 'dev_db'
}));

// Asynchronous configuration
container.registerDynamicModule(DatabaseModule.configAsync(async () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME
})));
```

## Documentation

- [Getting Started](https://nexus.js.org/docs/getting-started)
- [Concepts](https://nexus.js.org/docs/concepts)
- [Modules](https://nexus.js.org/docs/modules)
- [Advanced Usage](https://nexus.js.org/docs/advanced)

## Examples

- [Basic Usage](examples/basic-usage.ts)
- [Advanced Usage](examples/advanced-usage.ts)
- [Dynamic Modules](examples/dynamic-modules.ts)
- [React Router Integration](examples/react-router/)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.