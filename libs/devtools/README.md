# @nexusdi/devtools

[![npm](https://img.shields.io/npm/v/@nexusdi/devtools/next)](https://www.npmjs.com/package/@nexusdi/devtools)
[![license](https://img.shields.io/npm/l/@nexusdi/devtools)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Introspect and trace your NexusDI container.**

`@nexusdi/devtools` is a plugin that provides deep visibility into the internal state of your container. It allows you to see exactly how your dependencies are wired and how they are instantiated.

## Key Capabilities

### 1. Graph Introspection

Retrieve the entire compiled module graph as JSON. You can use this to build visual diagrams or to programmatically verify your architecture. Get it with `graph(ship)`, or with `inspect(root)` without building anything. `toMermaid()` and `toDot()` draw it as Mermaid or Graphviz text.

### 2. Lifecycle Tracing

Observe every event in the container's lifecycle in real-time. `trace(fn)` is a plugin that passes each event to `fn`. You can track:

- When a provider is constructed.
- When a singleton's `onInit` completes.
- When a scope is created or disposed.
- The exact order of instance disposal.

### 3. Error Formatting

Includes the `@nexusdi/errors` engine to provide human-readable fix suggestions for wiring mistakes.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/devtools@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, toMermaid } from '@nexusdi/devtools';
import { trace } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
class StarCharts implements INavCharts {
  plot = (to: string) => `course to ${to}`;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

await using ship = await Nexus.create(Navigation, { plugins: [devtools()] });
toMermaid(graph(ship)).split('\n')[0]; // -> 'flowchart LR'

const events: string[] = [];
const plugins = [trace((event) => events.push(event.type))];
await using traced = await Nexus.create(Navigation, { plugins });
events; // -> ['compile', 'construct']
```

## Documentation

- [Introspection Guide](https://nexus.js.org/next/introspection/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/devtools/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
