---
title: 'The jump to lightspeed'
authors: [evanion]
tags: [release, decorators, typescript, modules, breaking-changes]
description: "NexusDI now uses native decorator metadata, drops reflect-metadata, and unifies module configuration. Here's what's new, why it matters, and how to upgrade."
---

# 🚀 Native Decorators, Simpler Modules, and a Future-Proof NexusDI

NexusDI just made the jump to lightspeed! With our latest release, you can say goodbye to `reflect-metadata`, enjoy a cleaner module API, and rest easy knowing your DI setup is ready for the next era of TypeScript and JavaScript. Let's take a tour of what's new, why it matters, and how to upgrade.

<!--truncate-->

## ⚡ Native Decorator Metadata (No More reflect-metadata!)

NexusDI now uses the new [ECMAScript decorator metadata standard](https://github.com/tc39/proposal-decorator-metadata) via `Symbol.metadata`, as supported in TypeScript 5.2+ and the upcoming JavaScript standard.

- **No more `reflect-metadata`**: You don't need to install or import it—ever (unless your other dependencies require it).
- **Cleaner tsconfig**: No more `emitDecoratorMetadata`. Just enable `experimentalDecorators` and (optionally) `useDefineForClassFields` (the default in TS 5.2+).
- **Automatic polyfill**: NexusDI includes a tiny, built-in polyfill for `Symbol.metadata` if your runtime doesn't support it yet. No extra setup required.
- **Future-proof**: Your code is ready for the next generation of TypeScript and JavaScript.

> "It's like switching from a hyperdrive that needs constant repairs to one that just works."

### Example

```typescript
import { Service, Inject, Nexus, Token } from '@nexusdi/core';

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

> **Note:** NexusDI v0.3+ uses native decorator metadata (TypeScript 5.2+). You do not need to install or import `reflect-metadata`, and you do not need `emitDecoratorMetadata` in your tsconfig. Only `experimentalDecorators` and `useDefineForClassFields` (default in TypeScript 5.2+) are required.

---

## 📦 Unified Module API: `services` and `providers` Merged

Modules are now simpler and less confusing! Instead of juggling both `services` and `providers` arrays, you now use a single `providers` array for everything:

**Before:**

```typescript
@Module({
  services: [UserService],
  providers: [{ token: USER_REPO, useClass: UserRepo }],
})
export class UserModule {}
```

**Now:**

```typescript
@Module({
  providers: [UserService, { token: USER_REPO, useClass: UserRepo }],
})
export class UserModule {}
```

- **Less boilerplate**: One array, all your dependencies.
- **Clearer intent**: No more guessing where things go.

---

## 🎯 Why This Matters

- **Smaller bundles**: No more `reflect-metadata` means less code in your app.
- **Faster startup**: Native metadata is faster and more reliable.
- **Modern and future-proof**: Aligns with the latest TypeScript and ECMAScript standards.
- **Easier migration**: The new module API is simpler and more intuitive.

---

## 🔧 How to Upgrade

1. **Update TypeScript**: Make sure you're on TypeScript 5.2 or later.
2. **Update your tsconfig**:
   - Cleanup `emitDecoratorMetadata`, if you don't need it for anything else
   - Ensure `experimentalDecorators` is enabled
   - (Optional) `useDefineForClassFields` should be enabled (default in TS 5.2+)
3. **Remove all imports of `reflect-metadata`**.
4. **Update your modules**: Merge `services` and `providers` into a single `providers` array.
5. **Enjoy a cleaner, faster, and more modern DI experience!**

---

## 🧑‍💻 Other Notable Improvements

- **Dynamic Modules**: More flexible module registration and configuration. (was ghost launched in 0.2)
- **Better Type Safety**: Improved generics and overloads for decorators and containers.
- **Performance**: Optimized for tree-shaking and minimal runtime overhead.
- **Polyfill Included**: No manual setup for `Symbol.metadata`—it just works.

---

## 🛣️ Next Steps

- [Getting Started Guide](/docs/getting-started)
- [Advanced Providers & Factories](/docs/advanced/advanced-providers-and-factories)
- [Best Practices](/docs/best-practices)
- [Roadmap](/docs/roadmap)

---

## ✨ Lets boldly go where few have gone before!

This release is a big step toward a simpler, more powerful, and future-ready dependency injection experience for TypeScript and JavaScript developers. We can't wait to see what you build with NexusDI!

Have questions, feedback, or want to contribute? [Check out our docs](https://nexus.js.org/), [join the discussion](https://github.com/NexusDI/core/discussions), or [open an issue](https://github.com/NexusDI/core/issues).

---

_Want to help improve NexusDI?_  
Read our [contribution guidelines](/docs/contributing) and join the journey! 🚀
