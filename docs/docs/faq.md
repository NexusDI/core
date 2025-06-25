---
sidebar_position: 9
title: FAQ
---

# FAQ & Troubleshooting 🤔

Got questions? We've got answers! This section covers the most common questions and issues you might encounter while using NexusDI. Don't worry - we've all been there, and there's no such thing as a silly question (except maybe "Can I use this to make coffee?" - the answer is no, but we appreciate the creativity).

## Why am I getting 'Decorators are not valid here' errors in my tests/examples?

Ah, the classic decorator confusion! This usually happens when TypeScript doesn't know it's supposed to be your friend. Make sure your `tsconfig.json` includes your test and example files, and has `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` enabled. Example:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
    // ...other options
  },
  "include": ["src/**/*"]
}
```

## How do I use custom tokens?

Great question! Use a string or `Token` as a token, and the `@Inject(token)` decorator to inject it. It's like giving your dependencies name tags - simple but effective!

## What runtime dependencies does Nexus have?

Nexus is a lightweight library that believes in traveling light! It has only 1 runtime dependency, and that is `reflect-metadata`. That's it - no heavy baggage here!

## How do I debug dependency resolution issues?

When things go sideways (and they will, because that's just how coding works), try these debugging steps:

- Check that all services/providers are registered in the correct module (like making sure you have all the ingredients in recipe)
- Use explicit tokens and `@Inject` if needed (sometimes being explicit is better than being clever)
- Use `nexus.has(token)` to check registration (like checking if you actually put your keys in your pocket)

## How do I fix circular dependency errors?

Ah, the dreaded circular dependency - it's like trying to give yourself a high-five! Circular dependencies occur when two or more services depend on each other, either directly or indirectly. This usually results in errors like "No provider found for token" or stack overflows. To fix them:

- Refactor your code to remove the cycle if possible (the cleanest solution)
- Use property injection or lazy resolution as a workaround (with caveats - like using duct tape, it works but isn't always pretty)
- See the [Circular Dependencies](advanced/circular-dependencies.md) article for detailed strategies, examples, and workarounds

Sometimes you need to pull a Bob and create a fresh instance to break out of that recursive loop!

## Where can I get help?

Don't suffer in silence! We're here to help:

- [GitHub Issues](https://github.com/NexusDI/core/issues) - For bugs and feature requests
- [Discussions](https://github.com/NexusDI/core/discussions) - For questions, ideas, and general chit-chat

Remember: Every expert was once a beginner who asked a lot of questions. Keep asking, keep learning, and keep building awesome things! 🚀✨
