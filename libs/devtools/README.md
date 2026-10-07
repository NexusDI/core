# @nexusdi/devtools

[![npm](https://img.shields.io/npm/v/@nexusdi/devtools/next)](https://www.npmjs.com/package/@nexusdi/devtools)
[![license](https://img.shields.io/npm/l/@nexusdi/devtools)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Gain total visibility into your dependency graph and container lifecycle.**

Debugging dependency injection often feels like a black box. When wiring fails or singletons instantiate in the wrong order, you are left guessing how the container resolved your dependencies or why a specific instance exists.

`@nexusdi/devtools` provides the visibility needed to solve these issues. It transforms the opaque internal state of your NexusDI container into traceable events and exportable graphs.

## Key Features

**Analyze the architectural layout of your application.**
Graph introspection allows you to retrieve the compiled module graph as JSON via `graph(ship)` or `inspect(root)`. Use `toMermaid()` or `toDot()` to generate visual diagrams in Mermaid or Graphviz.

**Monitor container activity in real-time.**
Lifecycle tracing uses the `trace(fn)` plugin to intercept every container event. You can track provider construction, `onInit` completion, scope creation, and the exact order of disposal.

**Resolve wiring errors faster.**
The package integrates the `@nexusdi/errors` engine to turn cryptic failures into human-readable fix suggestions.

**Technical Specifications.**
This package is ESM-only and requires matching `@next` versions across all @nexusdi dependencies to avoid peer conflict.

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
