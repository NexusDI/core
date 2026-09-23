---
sidebar_position: 10
---

# Module Inheritance

Module inheritance lets you build on existing modules by subclassing them, but beware: in NexusDI, only classes explicitly decorated with `@Module` are treated as modules! This article covers how inheritance works, why explicit decoration is required, and how to avoid common pitfalls.

## Why Inherit Modules? 🤖

Module inheritance lets you extend existing modules with new providers or configuration, making it easy to reuse and adapt functionality for different scenarios. It's like giving your modules an upgrade!

## Basic Example: Parent and Subclass

```typescript
import { Module, Service } from '@nexusdi/core';

@Service()
class LoggerService {}

@Module({
  providers: [LoggerService],
})
class LoggingModule {}

@Service()
class AuditService {}

@Module({
  providers: [AuditService],
})
class AuditingModule extends LoggingModule {}
```

## Pitfall: Metadata Inheritance

By default, both TypeScript's `Reflect.getMetadata` and native `Symbol.metadata` (as accessed via NexusDI's `getMetadata`) will return metadata from the parent if the subclass isn't decorated. This can lead to subtle bugs:

```typescript
import { getMetadata, METADATA_KEYS } from '@nexusdi/core';

const parentMeta = getMetadata(LoggingModule, METADATA_KEYS.MODULE_METADATA); // { providers: [LoggerService] }
const childMeta = getMetadata(
  ExtendedLoggingModule,
  METADATA_KEYS.MODULE_METADATA
); // { providers: [LoggerService] } (inherited!)
```

> **Note:** This inheritance behavior applies to both legacy `Reflect.getMetadata` and modern native `Symbol.metadata` (as used by NexusDI's `getMetadata`).

This means **subclasses without `@Module` will appear to have the parent's metadata**, but NexusDI expects every module to be explicitly decorated. The real risk is that your subclass will only include the parent's providers and configuration — any new configuration added in the child will be ignored unless you decorate the subclass with `@Module`. To add new providers or configuration to a child module, you must decorate it as a module.

## Best Practice: Always Decorate Subclasses

If you want a subclass to be a module, always decorate it:

```typescript
@Service()
class AuditService {
  constructor(private readonly logger: LoggerService) {}
}

@Module({
  providers: [AuditService],
})
class AuditingModule extends LoggingModule {}
```

## Testing Module Inheritance 🧪

Here's how you can test correct and incorrect inheritance:

```typescript
import { Module, Service, METADATA_KEYS, getMetadata } from '@nexusdi/core';

describe('Module inheritance', () => {
  @Service()
  class LoggerService {}

  @Module({ providers: [LoggerService] })
  class LoggingModule {}

  class ExtendedLoggingModule extends LoggingModule {}

  it('should not have metadata on subclass if not decorated', () => {
    const metadata = getMetadata(
      ExtendedLoggingModule,
      METADATA_KEYS.MODULE_METADATA
    );
    expect(metadata).toBeUndefined();
  });

  it('should have metadata on parent if decorated', () => {
    const metadata = getMetadata(LoggingModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toBeDefined();
  });
});
```

## Real-World Example: Extending a Feature Module

```typescript
@Module({
  providers: [
    { token: USER_SERVICE, useClass: UserService },
    { token: USER_CONFIG, useValue: { feature: 'basic' } },
  ],
})
class UserModule {}

// Add premium features by extending and redecorating
@Module({
  providers: [
    { token: USER_SERVICE, useClass: PremiumUserService },
    { token: USER_CONFIG, useValue: { feature: 'premium' } },
  ],
})
class PremiumUserModule extends UserModule {}
```

## Inheritance vs. Imports: Which Should You Use?

**Module Inheritance**

- Lets you create a new module by extending an existing one (using `class ChildModule extends ParentModule {}` and `@Module`).
- Allows you to override or add to the parent's configuration, but only if you decorate the subclass with `@Module`.
- Can be useful for frameworks or libraries that want to provide a base module with overridable behavior.
- **Pitfall:** If you forget to decorate the subclass, only the parent's configuration is used—any additions in the child are ignored.

**Module Imports (Composition)**

- Use the `imports` property in the `@Module` decorator to include other modules.
- The imported module's providers/services become available for injection, but the modules remain independent.
- This is the standard and recommended way to compose features and share functionality in most DI systems, including NexusDI.
- You cannot override the configuration of an imported module from the importing module.

> **Best Practice:**
> For most use cases, prefer module composition (using `imports`) over inheritance. Composition keeps modules decoupled and easier to reason about. Use inheritance only when you have a clear need for shared, overridable configuration and understand the risks.

## Summary & Next Steps

- **Always decorate subclasses with `@Module` if you want them to be modules.**
- Undecorated subclasses inherit metadata, which can cause subtle bugs.
- Use inheritance to extend modules, but be explicit!

**Next Steps:**

- [Module Patterns](../modules/module-patterns)
- [Dynamic Modules](../modules/dynamic-modules)
- [Testing](../testing.md)
- [Advanced Providers and Factories](./advanced-providers-and-factories.md)

> "The metadata is strong with this one. But only if you use the decorator!" – Obi-Wan, probably
