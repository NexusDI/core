---
sidebar_position: 2
---

# Multi-injection & Collections

Learn how to inject arrays of services, implement plugin systems, and use multi-provider tokens for advanced extensibility.

> See also: [Providers & Services](../providers-and-services.md), [Module Patterns](../module-patterns.md)

## True Multi-injection (Recommended)

To inject an array of services where each item may have dependencies, register each provider with the container and use a factory to resolve them:

```typescript
// Register each plugin with the container
container.set(PluginA, PluginA);
container.set(PluginB, PluginB);

// Register a token for the collection
const PLUGINS = new Token<Plugin[]>('PLUGINS');
container.set(PLUGINS, {
  useFactory: () => [
    container.get(PluginA),
    container.get(PluginB),
  ],
});
```

Now, when you inject `PLUGINS`, each plugin is resolved by the container, with all its dependencies injected.

## Simple Array Pattern (For Dependency-free Objects Only)

> **Note:** This pattern is only safe for plugins/services that have no dependencies, or if you manually construct their dependencies. The DI container will not inject dependencies into these instances.

```typescript
const PLUGINS = new Token<Plugin[]>('PLUGINS');
container.set(PLUGINS, { useValue: [new PluginA(), new PluginB()] });
```

## Plugin System Example

You can inject the array into a service:

```typescript
@Service()
class AppService {
  constructor(@Inject(PLUGINS) private plugins: Plugin[]) {}
  start() {
    this.plugins.forEach(plugin => plugin.run());
  }
}
```

---

## Advanced: Dynamic Plugin Registration

> _Use this pattern only if you need to add plugins at runtime._

```typescript
const plugins: Plugin[] = [];
function registerPlugin(plugin: Plugin) {
  plugins.push(plugin);
}
container.set(PLUGINS, { useFactory: () => plugins });
```

---

## Best Practices
- Prefer the factory-based pattern for true multi-injection, especially if plugins have dependencies.
- Use `useValue` with arrays only for dependency-free objects or manual construction.
- Use factories for dynamic or runtime registration.
- Document expected collection types for maintainability.

---

**Next:** [Scoped & Transient Lifetimes](scoped-and-transient-lifetimes.md) 