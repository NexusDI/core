# @nexusdi/core

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

## Features

- **TypeScript-native decorators** for clean, type-safe DI
- **Modular & lightweight**: minimal dependencies, fast startup
- **Works everywhere:** Node.js, browser, React, React Native, SPA, mobile apps, and more (if it runs JavaScript, this package will work)

## Quick Start

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

- 📚 [Full Documentation](https://nexus.js.org)
- 💬 [Get Help / Ask Questions](https://github.com/NexusDI/core/discussions)

## License

MIT
