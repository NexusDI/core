# NexusDI

<div align="center">
  <img src="logo.svg" alt="NexusDI Logo" width="120" height="120" />
  <br />
  <p><strong>A modern, lightweight dependency injection container for TypeScript with decorator support, inspired by industry-leading frameworks.</strong></p>
  <p><em>The DI library that doesn't make you want to inject yourself with coffee ☕</em></p>
</div>

<div align="center">

[![npm version](https://badge.fury.io/js/%40nexusdi%2Fcore.svg)](https://badge.fury.io/js/%40nexusdi%2Fcore)
[![npm downloads](https://img.shields.io/npm/dm/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/min/@nexusdi/core)](https://bundlephobia.com/package/@nexusdi/core)
[![GitHub stars](https://img.shields.io/github/stars/NexusDI/core.svg?style=social&label=Star)](https://github.com/NexusDI/core)

</div>

## Features

- 🚀 **Modern & Type-Safe** - Built with TypeScript decorators for a fully type-safe experience
- 🧩 **Powerful Module System** - Organize your application into modules with support for both static and dynamic configuration
- ⚡ **Dynamic Configuration** - Static methods for environment-specific module configuration (inspired by industry leaders)
- 🎯 **Developer-Friendly API** - Clean and intuitive API that makes dependency management simple
- 📦 **Lightweight** - One dependency, minimal bundle size
- 🔧 **Flexible** - Support for both class-based and factory providers

## 📊 Performance Comparison

| Library    | Startup Time | Resolution Time | Memory Usage | Bundle Size |
|------------|--------------|----------------|-------------|-------------|
| **NexusDI**   | 1.3μs        | 0.2μs          | 6KB         | 96KB        |
| InversifyJS | 22.2μs       | 1.4μs          | 32KB        | 114KB       |
| tsyringe    | 45.2μs       | 0.9μs          | 150KB       | 99KB        |
| TypeDI      | 2.0μs        | 0.1μs          | 2KB         | 89KB        |

<sup>Based on real benchmarks: 1,000 startup iterations, 10,000 resolution iterations, Node.js v22.13.1, M1 Pro MacBook.</sup>

👉 **See the full [Performance & Bundle Size](https://nexus.js.org/docs/performance) article for methodology and details.**

## Quick Start

```bash
npm install @nexusdi/core reflect-metadata
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
container.set(UserModule);
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
container.set(DatabaseModule.config({
  host: 'localhost',
  port: 5432,
  database: 'dev_db'
}));

// Asynchronous configuration
container.set(DatabaseModule.configAsync(async () => ({
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