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
    "src/**/*",
    "examples/**/*"
  ]
}
```

## How do I use custom tokens?

Use a string or symbol as a token, and the `@Inject(token)` decorator to inject it.

## How do I migrate from Jest/ESLint to Vitest/Biome?

- Replace Jest with [Vitest](https://vitest.dev/) for testing. Use `vi.fn()` instead of `jest.fn()` for mocks.
- Replace ESLint with [Biome](https://biomejs.dev/) for linting and formatting. See the README for updated scripts.

## How do I debug dependency resolution issues?

- Check that all services/providers are registered in the correct module.
- Use explicit tokens and `@Inject` if needed.
- Use `nexus.has(token)` to check registration.

## Where can I get help?

- [GitHub Issues](https://github.com/your-org/nexusdi/issues)
- [Discussions](https://github.com/your-org/nexusdi/discussions) 