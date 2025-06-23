---
sidebar_position: 9
---

# FAQ & Troubleshooting

## Why am I getting 'Decorators are not valid here' errors in my tests/examples?

Make sure your `tsconfig.json` includes your test and example files, and has `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` enabled. Example:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // ...other options
  },
  "include": [
    "src/**/*"
  ]
}
```

## How do I use custom tokens?

Use a string or `Token` as a token, and the `@Inject(token)` decorator to inject it.

## What runtime dependencies does Nexus have?
Nexus have 1 runtime dependency, and that is `reflect-metadata`.

## How do I debug dependency resolution issues?

- Check that all services/providers are registered in the correct module.
- Use explicit tokens and `@Inject` if needed.
- Use `nexus.has(token)` to check registration.

## How do I fix circular dependency errors?

Circular dependencies occur when two or more services depend on each other, either directly or indirectly. This usually results in errors like "No provider found for token" or stack overflows. To fix them:
- Refactor your code to remove the cycle if possible.
- Use property injection or lazy resolution as a workaround (with caveats).
- See the [Circular Dependencies](advanced/circular-dependencies.md) article for detailed strategies, examples, and workarounds.

## Where can I get help?

- [GitHub Issues](https://github.com/NexusDI/core/issues)
- [Discussions](https://github.com/NexusDI/core/discussions) 