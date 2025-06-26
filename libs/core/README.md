# @nexusdi/core

[![npm version](https://img.shields.io/npm/v/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
[![build status](https://github.com/NexusDI/core/actions/workflows/ci.yml/badge.svg)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@nexusdi/core.svg)](./LICENSE)

NexusDI offers a fast, modern DI container for TypeScript projects.  
This package delivers the core engine used by all NexusDI modules and extensions.

## Installation

```bash
npm install @nexusdi/core
```

## Usage

```typescript
import { Nexus, Service, Inject } from '@nexusdi/core';

@Service()
class Logger {}

@Service()
class UserService {
  constructor(@Inject(Logger) private logger: Logger) {}
}

const container = new Nexus();
container.set(Logger);
container.set(UserService);

const userService = container.get(UserService);
```

## Documentation

- 📚 [Full Documentation](https://nexusdi.dev)
- 💬 [Get Help / Ask Questions](https://github.com/NexusDI/core/discussions)

## License

MIT
