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

## Where can I get help?

- [GitHub Issues](https://github.com/NexusDI/core/issues)
- [Discussions](https://github.com/NexusDI/core/discussions) 