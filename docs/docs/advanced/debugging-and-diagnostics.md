---
sidebar_position: 8
---

# Debugging & Diagnostics

Learn how to debug dependency injection issues, inspect the container, and use TypeScript for diagnostics in NexusDI.

> See also: [Testing](../testing.md), [Concepts](../concepts.md)

## Quick Debugging Tips (Recommended)
- If a provider is missing or misconfigured, NexusDI will throw an error with the token name.
- Use TypeScript types to catch injection errors at compile time:

```typescript
const userService = container.get<UserService>(UserService); // Type-safe
```

---

## Advanced: Inspecting & Logging

> _Use these patterns for deeper inspection or troubleshooting._

- Inspect registered providers and modules:
  ```typescript
  const { providers, modules } = container.list();
  console.log('Providers:', providers);
  console.log('Modules:', modules);
  ```
- Log provider registration and resolution in development:
  > **Note:** Avoid manually instantiating services with dependencies in a factory. Use the container's `resolve` method to ensure dependencies are injected.
  ```typescript
  container.set(UserService, {
    useFactory: () => {
      console.log('Resolving UserService');
      return container.resolve(UserService);
    },
  });
  // Only needed if you want to add custom logic (like logging) during resolution.
  ```
- Write tests for module wiring and injection.

---

**End of Advanced Topics** 