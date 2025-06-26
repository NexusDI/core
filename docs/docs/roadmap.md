---
sidebar_position: 10
title: Roadmap
---

# Roadmap & Planned Features

This is a living document outlining planned and possible features for NexusDI. Each feature includes a description, market and performance impact, possible implementation strategies, and proposed API sketches.

## Summary Table

| Feature                                     | Market Impact | Performance Impact | Notes                                                              |
| ------------------------------------------- | :-----------: | :----------------: | ------------------------------------------------------------------ |
| Lifetime Decorators                         |     ★★★★☆     |       ★☆☆☆☆        | Ergonomics, parity with top DI libraries                           |
| Automatic Disposal                          |     ★★★★☆     |       ★☆☆☆☆        | Essential for resource management                                  |
| Circular Dependency Fix                     |     ★★★★☆     |       ★★☆☆☆        | Lazy proxies, matches Angular/NestJS/TypeDI                        |
| Interceptors/Middleware                     |     ★★★★☆     |       ★★☆☆☆        | AOP, cross-cutting concerns, enterprise appeal                     |
| Graph Visualization                         |     ★★★☆☆     |       ☆☆☆☆☆        | Dev tool only, great for onboarding/debugging                      |
| Plugin/Extension System                     |     ★★★★★     |       ☆☆☆☆☆        | Ecosystem driver, enables integrations and community growth        |
| Native Decorator Metadata (Symbol.metadata) |     ★★★★☆     |       ★☆☆☆☆        | Standards-based, enables removal of reflect-metadata, future-proof |
| Benchmarking Suite & Nx Plugin              |     ★★★☆☆     |       ☆☆☆☆☆        | Enables transparent, reproducible performance comparisons          |

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
- We could make use of `using` keyword introduced in TypeScript 5.2, together with `Symbol.dispose`

**Planned: TypeScript 5.2+ Disposal Protocol**

We plan to leverage TypeScript 5.2's new disposal protocol for even more ergonomic resource management:

- The container class (`Nexus`) will implement the `Disposable` interface by providing a `[Symbol.dispose]()` method.
- When you use the `using` keyword with a container instance, all services/providers registered in that container (and its children) that implement `Disposable` will be disposed automatically at the end of the scope.
- This enables **automatic, scope-based cleanup** of all resources managed by the container.

**Example:**

```typescript
using container = new Nexus();
// ... register services, resolve, use ...
// At the end of the scope, container.[Symbol.dispose]() is called,
// which in turn disposes all services/providers that implement Disposable.
```

**Benefits:**

- Modern, idiomatic resource management for TypeScript 5.2+ users
- Automatic cleanup of all resources (DB connections, files, etc.) managed by the container
- Encourages best practices for resource lifecycle management
- Backwards compatible: manual disposal still supported

**Considerations:**

- Requires TypeScript 5.2+ for the `using` keyword and `Disposable` interface
- Disposal is synchronous (async disposal may be supported in future TypeScript versions)
- Disposal is idempotent (safe to call multiple times)

This feature will make NexusDI one of the most modern and ergonomic DI containers for TypeScript. Stay tuned for updates and documentation as this lands!

**Proposed API:**

```typescript
class Database {
  async onDestroy() {
    await this.connection.close();
  }
}

container.destroy(); // Calls onDestroy on all instances
```

**Service/Provider-Level Disposal**

To take advantage of automatic disposal, your services or providers can implement the `Disposable` interface by defining a `[Symbol.dispose]()` method. The container will automatically call this method for all registered instances when it is disposed (either via `using` or manual disposal).

**Example:**

```typescript
class Database implements Disposable {
  connection: SomeDbConnection;

  [Symbol.dispose]() {
    this.connection.close();
    // Any other cleanup logic
  }
}

container.set(Database, { useClass: Database });

using container = new Nexus();
// ... use container ...
// At the end of the scope, Database.[Symbol.dispose]() is called automatically
```

- Implementing `[Symbol.dispose]()` is the idiomatic way to participate in resource cleanup.
- You can use the `Disposable` type from TypeScript for type safety:

```typescript
import type { Disposable } from 'typescript';

class MyService implements Disposable {
  [Symbol.dispose]() {
    // cleanup
  }
}
```

- All singletons and scoped instances managed by the container that implement `[Symbol.dispose]()` will be disposed automatically.

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
class A {
  constructor(@Inject(B) b: B) {
    this.b = b;
  }
}
@Service()
class B {
  constructor(@Inject(A) a: A) {
    this.a = a;
  }
}
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
  getUser() {
    /* ... */
  }
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
container.registerModule(
  TypeOrmModule.config({
    /* ... */
  })
);
```

---

## Native Decorator Metadata (Symbol.metadata)

**Description:** Migrate from the legacy `reflect-metadata` library to the new standards-based decorator metadata protocol using `Symbol.metadata`, as supported in TypeScript 5.2+ and the upcoming ECMAScript standard.

- **Market Impact:** High (future-proof, reduces dependencies, aligns with ECMAScript)
- **Performance Impact:** Minimal (native, no polyfill required)

**Possible Implementation:**

- Refactor all decorators and metadata access to use `Symbol.metadata` instead of `Reflect.defineMetadata`/`Reflect.getMetadata`.
- Remove `reflect-metadata` as a dependency.
- Ensure all design-time type metadata (e.g., for constructor injection) is supported by the new protocol.
- Provide a migration path for users upgrading from older TypeScript versions.

**Proposed API:**

```typescript
function Service(): ClassDecorator {
  return (target) => {
    (target as any)[Symbol.metadata] = {
      ...(target as any)[Symbol.metadata],
      service: { token: target },
    };
  };
}

// Reading metadata
const serviceMeta = (MyService as any)[Symbol.metadata]?.service;
```

**Migration Plan:**

- Update all decorators to use `Symbol.metadata`.
- Remove all imports and usage of `reflect-metadata`.
- Update documentation and examples to reflect the new standard.
- Ensure compatibility with TypeScript 5.2+ and document any breaking changes.

**Benefits:**

- Standards-based, future-proof metadata handling
- No runtime dependency on `reflect-metadata`
- Aligns with ECMAScript and TypeScript best practices

Stay tuned for updates as this feature is rolled out!

**Note:**
NexusDI will include a built-in polyfill for `Symbol.metadata` to ensure compatibility with all JavaScript runtimes, even those that do not yet support this feature natively. This polyfill is lightweight, only defines `Symbol.metadata` if it is missing, and will never overwrite a native implementation if one exists in the environment. By including this polyfill automatically at the library level, NexusDI removes the need for users to add or configure it themselves, making setup seamless and reducing the risk of errors.

This approach ensures a smooth migration to the new decorator metadata standard and future-proofs your codebase as runtimes adopt native support. **However, you still need to set the correct TypeScript compiler options** (such as `target`, `lib`, and `esnext.decorators`) as described above to enable the new decorator and metadata features in your project.

## Benchmarking Suite & Nx Plugin

**Description:**
A dedicated benchmarking suite and Nx plugin to provide objective, reproducible performance data for NexusDI and other DI containers.

- **Market Impact:** Medium (transparency, trust, and competitive positioning)
- **Performance Impact:** None (dev tool only)

**Possible Implementation:**

- Maintain a benchmarking suite as an Nx plugin in the `tools` folder.
- Include a generator to scaffold new benchmarks for NexusDI and other DI containers.
- Provide an executor to run benchmarks and collect results in a consistent format.
- Cover common DI operations (container creation, registration, resolution, etc.) and real-world scenarios.
- Use results for documentation, marketing, and ongoing optimization.

**Proposed API:**

```bash
# Run the NexusDI benchmark
nx run benchmarks-nexus:benchmark
```

**Benefits:**

- Ensures NexusDI remains competitive and transparent about its performance compared to other DI libraries.
- Guides optimizations and catches regressions early.
- Provides clear, reproducible data for users and contributors.

**Additional context:**
See the [NexusDI Roadmap](https://nexus.js.org/docs/roadmap) for the role of benchmarking in ongoing development and optimization. The Nx plugin approach ensures benchmarks are easy to extend and run as part of CI or release workflows.

## Community Feedback

We welcome your feedback and suggestions! Please join the discussion or propose new features in our [GitHub Discussions](https://github.com/NexusDI/core/discussions) section.

_This roadmap is subject to change based on user feedback and community needs. Contributions and suggestions are welcome!_

## Planned Features

### Scoped Lifetimes

```typescript
// Request-scoped services
container.set(UserService, { useClass: UserService, lifetime: 'scoped' });

// Session-scoped services
container.set(SessionManager, {
  useClass: SessionManager,
  lifetime: 'session',
});
```

### Lifecycle Hooks

```typescript
@Injectable()
class DatabaseService {
  onInit() {
    // Called when service is first created
    this.connect();
  }

  onDestroy() {
    // Called when container is destroyed
    this.disconnect();
  }
}
```

### Module System Enhancements

```typescript
// Dynamic module configuration
container.set(DatabaseModule, {
  services: [DatabaseService, ConnectionPool],
  providers: [{ token: DATABASE_CONFIG, useValue: { host: 'localhost' } }],
});

// Framework integrations
container.set(TypeOrmModule, {
  services: [TypeOrmService],
  providers: [
    {
      token: TYPEORM_CONFIG,
      useValue: {
        /* ... */
      },
    },
  ],
});
```
