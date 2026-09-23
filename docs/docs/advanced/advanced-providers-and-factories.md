---
sidebar_position: 1
---

# Advanced Providers & Factories

Take your provider patterns to the next level with advanced techniques for factories, async providers, and conditional registration.

> See also: [Providers & Services](../providers-and-services.md)

## Async Factory Providers

You can use `useFactory` with async functions to provide values that require asynchronous setup (e.g., fetching config from a remote source):

```text
container.set('CONFIG', {
  useFactory: async () => {
    const config = await fetchConfigFromRemote();
    return config;
  },
});
```

## Async Factory Provider vs DynamicModule

> **When to use each:**
>
> - Use an **async factory provider** for simple, one-off async values or services.
> - Use a **DynamicModule** when you need to configure a group of related providers/services, especially if you want module encapsulation, validation, or imports/exports.

| Use Case                        | Async Factory Provider | DynamicModule |
| ------------------------------- | :--------------------: | :-----------: |
| Single async value/service      |           ✅           |      🚫       |
| Multiple related providers      |           🚫           |      ✅       |
| Module-level config/validation  |           🚫           |      ✅       |
| Imports/exports between modules |           🚫           |      ✅       |
| Simple, one-off async setup     |           ✅           |      🚫       |

**Rule of Thumb:**

- Use an async factory provider for simple, one-off async values or services.
- Use a DynamicModule for configuring groups of related providers/services.

## Conditional Providers

Register providers only if certain conditions are met (e.g., environment, feature flag):

```text
// @ts-nocheck
if (process.env.NODE_ENV === 'production') {
  container.set('LOGGER', { useClass: ProdLogger });
} else {
  container.set('LOGGER', { useClass: DevLogger });
}
```

## Environment-based Configuration

> **Tip:**
> For most projects, just use environment variables and `useValue` for configuration. Use a factory only if you need to fetch or compute config at runtime.

### Simple Pattern (Recommended)

```text
container.set('DB_CONFIG', {
  useValue: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  },
});
```

### Advanced: Remote or Computed Config

> _Use this only if you need to fetch config from a remote service or merge multiple sources._

```text
container.set('DB_CONFIG', {
  useFactory: async () => {
    if (process.env.NODE_ENV === 'production') {
      return await fetchProdDbConfig();
    } else {
      return { host: 'localhost', port: 5432 };
    }
  },
});
```

## Real-World Example: Feature Toggle

```text
const FEATURE_FLAG = process.env.FEATURE_X_ENABLED === 'true';
container.set('FeatureService', {
  useClass: FEATURE_FLAG ? FeatureXService : NoopService,
});
```

## Best Practices

- Use async factories for config/services that require I/O.
- Use conditional registration for environment-specific or feature-flagged services.
- Prefer explicit tokens for clarity.

---

**Next:** [Multi-injection & Collections](multi-injection-and-collections.md)
