---
sidebar_position: 3
---

# Scoped & Transient Lifetimes

Understand how to manage object lifetimes: singleton (default), transient, and scoped, and how to implement them in NexusDI.

> See also: [Concepts](../concepts.md), [Module Basics](../module-basics.md)

## Singleton (Default, Recommended)

By default, all providers in NexusDI are singletons:

```typescript
container.set(LoggerService, LoggerService);
const logger1 = container.get(LoggerService);
const logger2 = container.get(LoggerService);
// logger1 === logger2
```

---

## Transient Lifetime (Manual Pattern)

> _Use this pattern if you need a new instance every time._

```typescript
container.set(UserService, {
  useFactory: () => new UserService(),
});
const user1 = container.get(UserService);
const user2 = container.get(UserService);
// user1 !== user2
```

---

## Scoped Lifetime (Manual Pattern)

> _Use this pattern to scope instances to a request, job, or test._

```typescript
const requestContainer = container.createChild();
requestContainer.set(SessionService, SessionService);
const session = requestContainer.get(SessionService);
```

Each child container has its own instance graph, so you can scope services per request, job, or test.

---

## Note: Built-in Decorators Planned

NexusDI does not yet provide built-in decorators for lifetimes. Use the above manual patterns for now. See the [Roadmap](../roadmap.md) for planned improvements.

---

**Next:** [Interceptors & Middleware](interceptors-and-middleware.md) 