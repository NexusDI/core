---
sidebar_position: 10
---

# Module Inheritance

Module inheritance lets you build on existing modules by subclassing them, but beware: in NexusDI, only classes explicitly decorated with `@Module` are treated as modules! This article covers how inheritance works, why explicit decoration is required, and how to avoid common pitfalls.

## Why Inherit Modules? 🤖

Module inheritance lets you extend existing modules with new services or configuration, making it easy to reuse and adapt functionality for different scenarios. It's like giving your modules an upgrade!

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

By default, TypeScript's `Reflect.getMetadata` will return metadata from the parent if the subclass isn't decorated. This can lead to subtle bugs:

```typescript
const parentMeta = Reflect.getMetadata('nexusdi:module', LoggingModule); // { providers: [LoggerService] }
const childMeta = Reflect.getMetadata('nexusdi:module', ExtendedLoggingModule); // { providers: [LoggerService] } (inherited!)
```

This means **subclasses without `@Module` will appear to have the parent's metadata**, but NexusDI expects every module to be explicitly decorated. The real risk is that your subclass will only include the parent's providers and configuration — any new configuration added in the child will be ignored unless you decorate the subclass with `@Module`. To add new services or providers to a child module, you must decorate it as a module.

## Best Practice: Always Decorate Subclasses

If you want a subclass to be a module, always decorate it:

```typescript
@Service()
class AuditService {}

@Module({
  providers: [],
})
class AuditingModule extends LoggingModule {}
```

## Testing Module Inheritance 🧪

Here's how you can test correct and incorrect inheritance:

```typescript
import { Module, Service } from '@nexusdi/core';
import { METADATA_KEYS } from '@nexusdi/core/src/types';

describe('Module inheritance', () => {
  @Service()
  class LoggerService {}
  @Module({ providers: [LoggerService] })
  class LoggingModule {}
  class ExtendedLoggingModule extends LoggingModule {}

  it('should not have metadata on subclass if not decorated', () => {
    const metadata = Reflect.getMetadata(
      METADATA_KEYS.MODULE_METADATA,
      ExtendedLoggingModule
    );
    expect(metadata).toBeUndefined();
  });

  it('should have metadata on parent if decorated', () => {
    const metadata = Reflect.getMetadata(
      METADATA_KEYS.MODULE_METADATA,
      LoggingModule
    );
    expect(metadata).toBeDefined();
  });
});
```

## Real-World Example: Extending a Feature Module

```typescript
@Module({
  services: [UserService],
  providers: [{ token: USER_CONFIG, useValue: { feature: 'basic' } }],
})
class UserModule {}

// Add premium features by extending and redecorating
@Module({
  services: [PremiumUserService],
  providers: [{ token: USER_CONFIG, useValue: { feature: 'premium' } }],
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

- [Module Patterns](../module-patterns.md)
- [Dynamic Modules](../dynamic-modules.md)
- [Testing](../testing.md)
- [Advanced Providers and Factories](./advanced-providers-and-factories.md)

> "The metadata is strong with this one. But only if you use the decorator!" – Obi-Wan, probably
