---
sidebar_position: 1
title: Welcome to NexusDI! 🎉
---

# Welcome to NexusDI!

Welcome to NexusDI - a dependency injection library that makes sense! No more wrestling with verbose containers or fighting with type systems. NexusDI is here to make your code cleaner, your tests easier, and your development experience smoother.

## What's This All About?

NexusDI is a powerful, lightweight, and ergonomic dependency injection (DI) container for TypeScript and JavaScript. It helps you organize your code without being overly opinionated about how you do it. It's the Millennium Falcon of DI libraries - it may not look like much, but it's got it where it counts.

## Why NexusDI? 🚀

- **Simple API:** Register and resolve services, values, and modules with a clean, intuitive interface
- **Type-safe:** Built for TypeScript, with full type inference and safety
- **Modular:** Organize your code with modules and dynamic configuration
- **Decorator Support:** Use decorators for services, providers, and injection
- **Testable:** Easily mock or override dependencies for testing

## Quick Start ⚡

First, install NexusDI:

```bash
npm install @nexusdi/core
```

Now, let's create a simple example:

```typescript
import { Nexus, Service, Token } from '@nexusdi/core';

const USER_SERVICE = new Token('UserService');

@Service()
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie'];
  }
}

const container = new Nexus();
container.set(USER_SERVICE, UserService);

const userService = container.get(USER_SERVICE);
console.log(userService.getUsers()); // ['Alice', 'Bob', 'Charlie']
```

That's it! In just a few lines, you've got a fully functional DI setup. Clean, predictable, and straightforward. May the dependencies be with you!

## Ready to Dive Deeper? 🏊‍♂️

Now that you've had a taste, explore the rest of the documentation to learn about modules, advanced features, and best practices. We promise it only gets better from here!

Let's build something awesome together! ✨

:::note

NexusDI 0.3 uses TypeScript's legacy decorators and requires `"experimentalDecorators": true` in your `tsconfig.json`. 0.3 does not support standard (TC39) decorators. Its decorators store metadata under the `Symbol.metadata` key, and NexusDI polyfills `Symbol.metadata` when the runtime lacks it. You do not need `reflect-metadata` or `emitDecoratorMetadata`.

:::
