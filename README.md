# NexusDI

<div align="center">
  <img src="https://nexus.js.org/img/logo.svg" alt="NexusDI Logo" width="120" height="120" />
  <br />
  <p><strong>A modern, lightweight dependency injection container for TypeScript with native decorators, inspired by industry-leading frameworks.</strong></p>
  <p><em>The DI library that doesn't make you want to inject yourself with coffee ☕</em></p>
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/nexusdi/core/ci.yml)
![Libraries.io dependency status for GitHub repo](https://img.shields.io/librariesio/github/nexusdi/core)

![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/%40nexusdi/core)
![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/%40nexusdi%2Fcore)
![Source language](https://img.shields.io/badge/language-TypeScript-blue)

[![npm downloads](https://img.shields.io/npm/dm/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
![GitHub License](https://img.shields.io/github/license/NexusDI/core)
![Released with provenance](https://img.shields.io/badge/provenance-signed-green)
[![GitHub stars](https://img.shields.io/github/stars/NexusDI/core.svg?style=social&label=Star)](https://github.com/NexusDI/core)

</div>

NexusDI is a modern, lightweight <strong>dependency injection (DI) container</strong> for <strong>TypeScript</strong> and <strong>Node.js</strong>. It uses native decorators and a modular architecture to help you write scalable, testable, and maintainable applications. Inspired by frameworks like InversifyJS, tsyringe, TypeDI, and NestJS, NexusDI brings high performance and a developer-friendly API to your JavaScript and TypeScript projects. Works seamlessly in Node.js and modern JavaScript environments.

# 🚨 Call for Feedback 🚨

**We want your input!**  
NexusDI thrives on community input!  
We have a number of open RFCs and discussions, and your feedback can help guide the direction of the project.  
Jump in and let us know what you think!

👉 [Share your ideas and feedback in the Ideas Discussions](https://github.com/NexusDI/core/discussions/categories/ideas)

We look forward to hearing from you!

---

## Features

- 🚀 **TypeScript-Native Decorators** – Harness the power of modern TypeScript decorators for robust, type-safe dependency injection
- 🧩 **Powerful Module System** - Organize your application into modules with support for both static and dynamic configuration
- ⚡ **Dynamic Configuration** - Static methods for environment-specific module configuration (inspired by industry leaders)
- 🎯 **Developer-Friendly API** - Clean and intuitive API that makes dependency management simple
- 📦 **Lightweight** - Low dependency, minimal bundle size
- 🔧 **Flexible** - Support for both class-based and factory providers

## Why NexusDI?

- <strong>TypeScript-first</strong>: Designed for modern TypeScript and JavaScript projects.
- <strong>Zero bloat</strong>: Minimal dependencies, small bundle size, and no runtime polyfills required.
- <strong>Native decorators</strong>: Uses the latest TypeScript decorator syntax for clean, intuitive code.
- <strong>Modular & extensible</strong>: Organize your app with modules, plugins, and dynamic configuration.
- <strong>Testable</strong>: Easily mock or override providers for unit and integration testing.
- <strong>Inspired by the best</strong>: Familiar patterns for those coming from InversifyJS, tsyringe, TypeDI or NestJS.

## Comparison / Alternatives

NexusDI is an alternative to:

- <strong>InversifyJS</strong>
- <strong>tsyringe</strong>
- <strong>TypeDI</strong>
- <strong>NestJS DI system</strong>

## 📊 Performance Comparison

| Library     | Startup Time | Resolution Time | Memory Usage | Bundle Size |
| ----------- | ------------ | --------------- | ------------ | ----------- |
| **NexusDI** | 1.3μs        | 0.2μs           | 6KB          | 96KB        |
| InversifyJS | 22.2μs       | 1.4μs           | 32KB         | 114KB       |
| tsyringe    | 45.2μs       | 0.9μs           | 150KB        | 99KB        |
| TypeDI      | 2.0μs        | 0.1μs           | 2KB          | 89KB        |

<sup>Based on real benchmarks: 1,000 startup iterations, 10,000 resolution iterations, Node.js v22.13.1, M1 Pro MacBook.</sup>

👉 **See the full [Performance & Bundle Size](https://nexus.js.org/docs/performance) article for methodology and details.**

## Quick Start

```bash
npm install @nexusdi/core
```

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022", // or later
    "experimentalDecorators": true,
    "useDefineForClassFields": true
  }
}
```

> **Note:** Only these options are required for NexusDI v0.3+. You do **not** need to install or import `reflect-metadata`.

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
  providers: [DatabaseService], // Simplified format - uses @Service decorator token
})
class DatabaseModule extends DynamicModule<DatabaseConfig> {
  protected readonly configToken = DATABASE_CONFIG;
}

// Usage
const container = new Nexus();

// Synchronous configuration
container.set(
  DatabaseModule.config({
    host: 'localhost',
    port: 5432,
    database: 'dev_db',
  })
);

// Asynchronous configuration
container.set(
  DatabaseModule.configAsync(async () => ({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
  }))
);
```

## Documentation

- [Getting Started](https://nexus.js.org/docs/getting-started)
- [Concepts](https://nexus.js.org/docs/concepts)
- [Modules](https://nexus.js.org/docs/modules)
- [Advanced Usage](https://nexus.js.org/docs/advanced)
- [Terminology](https://nexus.js.org/docs/terminology)

## Examples

- [Basic Usage](examples/basic-usage.ts)
- [Advanced Usage](examples/advanced-usage.ts)
- [Dynamic Modules](examples/dynamic-modules.ts)
- [React Router Integration](examples/react-router/)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
