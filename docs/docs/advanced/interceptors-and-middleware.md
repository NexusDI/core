---
sidebar_position: 4
---

# Interceptors & Middleware

Implement cross-cutting concerns like logging, validation, and error handling using provider patterns or manual wrapping in NexusDI.

> See also: [Providers & Services](../providers-and-services.md), [Module Patterns](../module-patterns.md)

## Simple Wrapping (Recommended)

The most ergonomic way to add cross-cutting logic is to wrap your service or method:

```typescript
function withLogging(service: UserService): UserService {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const orig = target[prop];
      if (typeof orig === 'function') {
        return function (...args: any[]) {
          console.log(`Calling ${String(prop)}`);
          return orig.apply(target, args);
        };
      }
      return orig;
    },
  });
}

container.set(UserService, {
  useFactory: () => withLogging(new UserService()),
});
```

---

## Advanced: Middleware-like Patterns

> _Use this pattern for pipelines or plugin-style composition._

```typescript
const MIDDLEWARE = new Token<MiddlewareFn[]>('MIDDLEWARE');
container.set(MIDDLEWARE, { useValue: [
  (next) => (ctx) => { console.log('mw1'); return next(ctx); },
  (next) => (ctx) => { console.log('mw2'); return next(ctx); },
] });

function applyMiddleware(middleware: MiddlewareFn[], handler: HandlerFn): HandlerFn {
  return middleware.reduceRight((next, mw) => mw(next), handler);
}
```

---

## Manual Decorator-based Interception

> _You can use TypeScript decorators for interception, but must apply them manually._

```typescript
function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey}`);
    return original.apply(this, args);
  };
}

class UserService {
  @Log
  getUser(id: string) { /* ... */ }
}
```

---

## Note: First-class Interceptors Planned

NexusDI will support built-in interceptors and middleware in the future. See the [Roadmap](../roadmap.md).

---

**Next:** [Dynamic Modules](../dynamic-modules.md) · [Module Patterns](../module-patterns.md) 