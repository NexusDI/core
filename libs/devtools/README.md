# @nexusdi/devtools

[![npm](https://img.shields.io/npm/v/@nexusdi/devtools/next)](https://www.npmjs.com/package/@nexusdi/devtools)
[![license](https://img.shields.io/npm/l/@nexusdi/devtools)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Introspect and trace your NexusDI container.**

`@nexusdi/devtools` is a development-only plugin that provides deep visibility into the internal state of your container. It allows you to see exactly how your dependencies are wired and how they are instantiated.

## Key Capabilities

### 1. Graph Introspection

Retrieve the entire compiled module graph as JSON. You can use this to build visual diagrams or to programmatically verify your architecture.

### 2. Lifecycle Tracing

Observe every event in the container's lifecycle in real-time. You can track:

- When a provider is constructed.
- When a singleton's `onInit` completes.
- When a scope is created or disposed.
- The exact order of instance disposal.

### 3. Error Formatting

Includes the `@nexusdi/errors` engine to provide human-readable fix suggestions for wiring mistakes.

## Installation

```bash
npm install -D @nexusdi/devtools@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, toMermaid } from '@nexusdi/devtools';

const NAV_CHARTS = new Token<any>('NavCharts');
const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_CHARTS, {
      useClass: class StarCharts {
        plot = (to) => `to ${to}`;
      },
    }),
  ],
});

await using ship = await Nexus.create(Navigation, { plugins: [devtools()] });
console.log(toMermaid(graph(ship)));
```

## Documentation

- [Introspection Guide](https://nexus.js.org/next/introspection/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
