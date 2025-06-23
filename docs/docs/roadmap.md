---
sidebar_position: 10
---

# Roadmap & Planned Features

This is a living document outlining planned and possible features for NexusDI. Each feature includes a description, market and performance impact, possible implementation strategies, and proposed API sketches.

## Summary Table

| Feature                  | Market Impact | Performance Impact | Notes                                                      |
|--------------------------|:-------------:|:-----------------:|------------------------------------------------------------|
| Lifetime Decorators      |     ★★★★☆     |      ★☆☆☆☆        | Ergonomics, parity with top DI libraries                   |
| Automatic Disposal       |     ★★★★☆     |      ★☆☆☆☆        | Essential for resource management                          |
| Circular Dependency Fix  |     ★★★★☆     |      ★★☆☆☆        | Lazy proxies, matches Angular/NestJS/TypeDI                |
| Interceptors/Middleware  |     ★★★★☆     |      ★★☆☆☆        | AOP, cross-cutting concerns, enterprise appeal             |
| Graph Visualization      |     ★★★☆☆     |      ☆☆☆☆☆        | Dev tool only, great for onboarding/debugging              |
| Plugin/Extension System  |     ★★★★★     |      ☆☆☆☆☆        | Ecosystem driver, enables integrations and community growth|

---

## Lifetime Decorators
**Description:** Decorators or provider options to declaratively set the lifetime of a service.

- **Market Impact:** High (ergonomics, parity with top DI libraries)
- **Performance Impact:** Minimal

**Possible Implementation:**
- Add decorators: `@Singleton`, `@Transient`, `@Scoped`
- Or: Provider options `{ lifetime: 'singleton' | 'transient' | 'scoped' }`
- Store lifetime metadata at registration, resolve accordingly

**Proposed API:**
```typescript
@Singleton()
class Logger {}

@Transient()
class RequestId {}

container.set(UserService, { useClass: UserService, lifetime: 'scoped' });
```

---

## Automatic Disposal / Lifecycle Hooks
**Description:** Support for cleaning up resources when a container or scope is destroyed.

- **Market Impact:** High (essential for backend/server apps)
- **Performance Impact:** Minimal (only on container destruction)

**Possible Implementation:**
- Detect `onDestroy`/`onDispose` methods on instances
- Call these methods when a container or child container is destroyed
- Optionally support async disposal

**Proposed API:**
```typescript
class Database {
  async onDestroy() {
    await this.connection.close();
  }
}

container.destroy(); // Calls onDestroy on all instances
```

---

## Circular Dependency Resolution
**Description:** Allow certain circular dependencies to resolve (e.g., via proxies or lazy injection), not just throw errors.

- **Market Impact:** High (real-world apps, parity with Angular/NestJS/TypeDI)
- **Performance Impact:** Moderate (only for affected dependencies)

**Possible Implementation:**
- Use proxies or lazy getters for constructor-injected dependencies
- Detect cycles and inject a proxy that resolves the dependency on first access
- Document limitations (e.g., not for immediate use in constructor)

**Proposed API:**
```typescript
@Service()
class A { constructor(@Inject(B) b: B) { this.b = b; } }
@Service()
class B { constructor(@Inject(A) a: A) { this.a = a; } }
// Both resolve, but only if not used immediately in constructor
```

---

## Interceptors / Middleware
**Description:** Built-in support for method/class-level interceptors (AOP-style).

- **Market Impact:** High (enterprise, cross-cutting concerns)
- **Performance Impact:** Moderate (adds a function call layer)

**Possible Implementation:**
- Decorators: `@Interceptor`, `@UseInterceptors`
- Register global or per-service interceptors
- Use proxies to wrap methods

**Proposed API:**
```typescript
function LogInterceptor(ctx, next) {
  console.log('Before');
  const result = next();
  console.log('After');
  return result;
}

@UseInterceptors(LogInterceptor)
class UserService {
  getUser() { /* ... */ }
}
```

---

## Graph Visualization
**Description:** Tooling (CLI or web) to visualize the dependency graph.

- **Market Impact:** Medium (onboarding, debugging, large teams)
- **Performance Impact:** None (dev tool only)

**Possible Implementation:**
- CLI command: `nexusdi graph` outputs DOT/JSON
- Web UI or integration with VSCode
- Optionally export graph as SVG/PNG

**Proposed API:**
```bash
npx nexusdi graph --output graph.svg
```

---

## Plugin/Extension System
**Description:** Official API and ecosystem for third-party modules (e.g., `@nexusdi/typeorm`, `@nexusdi/http`).

- **Market Impact:** Very High (ecosystem driver)
- **Performance Impact:** None (unless plugin is used)

**Possible Implementation:**
- Define a standard for DynamicModules as plugins
- Publish and document official and community plugins
- Add plugin discovery/registry to docs or CLI

**Proposed API:**
```typescript
import { TypeOrmModule } from '@nexusdi/typeorm';
container.registerModule(TypeOrmModule.config({ /* ... */ }));
```

---

## Community Feedback

We welcome your feedback and suggestions! Please join the discussion or propose new features in our [GitHub Discussions](https://github.com/NexusDI/core/discussions) section.

*This roadmap is subject to change based on user feedback and community needs. Contributions and suggestions are welcome!* 