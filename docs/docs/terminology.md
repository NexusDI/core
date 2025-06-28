# Terminology

A clear, shared vocabulary helps everyone understand and use NexusDI effectively. This page defines the core terms used throughout the documentation, RFCs, and codebase.

| Term          | Registered With            | Purpose/Role                                                                                                                     | Example Usage                                                              |
| ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Container** | n/a                        | The DI engine that manages providers, modules, plugins, and dependency resolution. The main implementation is the `Nexus` class. | `const container = new Nexus();`                                           |
| **Module**    | `.set()`                   | A feature or integration package that groups providers/services and may support configuration.                                   | `container.set(TypeOrmModule.config({ ... }))`                             |
| **Plugin**    | `.use()`                   | An extension or integration that adds cross-cutting concerns, hooks, or patches the container.                                   | `container.use(ConfigPlugin, { ... })`                                     |
| **Service**   | `.set()` (via `@Service`)  | A class intended to be instantiated and injected by the container, typically business logic or reusable functionality.           | `@Service() class UserService { ... }`                                     |
| **Provider**  | `.set()`                   | Any value/class/factory registered with the container to fulfill a dependency. Can be a service, value, or factory.              | `container.set({ provide: TOKEN, useValue: ... })`                         |
| **Factory**   | `.set()` (as `useFactory`) | A function that produces a value or instance, often with dependencies injected. Used for dynamic or computed providers.          | `container.set({ provide: TOKEN, useFactory: (dep) => ..., deps: [Dep] })` |

---

## Definitions

- **Container:**
  The DI engine that manages all providers, modules, plugins, and dependency resolution. In NexusDI, this is the `Nexus` class.

- **Module:**
  A group of related providers/services, often representing a feature or integration. Registered with `.set()`. May support static or dynamic configuration via `.config()`/`.configAsync()`.

- **Plugin:**
  An extension registered with `.use()`. Used for cross-cutting concerns, container hooks, or to patch/extend the container. Examples: config, validation, logging plugins.

- **Service:**
  A class decorated with `@Service()` (or similar), intended to be instantiated and injected by the container. Represents business logic, utilities, or reusable functionality.

- **Provider:**
  Any value, class, or factory registered with the container to fulfill a dependency. Providers can be services, values, or factories.

- **Factory:**
  A function that returns a value or instance, often with dependencies injected. Used for dynamic or computed providers, registered via `useFactory`.

---

## Suggestions?

If you think a term is missing or unclear, please [open a discussion](https://github.com/NexusDI/core/discussions/categories/ideas) or a PR!
