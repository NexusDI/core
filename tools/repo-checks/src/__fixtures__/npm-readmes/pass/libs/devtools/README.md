# @nexusdi/devtools

[![npm](https://img.shields.io/npm/v/@nexusdi/devtools/next)](https://www.npmjs.com/package/@nexusdi/devtools)
[![license](https://img.shields.io/npm/l/@nexusdi/devtools)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Introspect and trace your NexusDI container.**

A developer debugging a wiring problem needs to see the graph the container compiled.

<img src="https://raw.githubusercontent.com/NexusDI/core/refs/tags/@nexusdi/core@0.4.0-rc.1/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: Bridge imports Engineering" width="720">

## Key Capabilities

### Graph Introspection

`graph()` returns the compiled module graph as JSON.

## Installation

```bash
npm install @nexusdi/devtools@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
class StarCharts implements INavCharts {
  plot = (to: string) => to;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Bridge = defineModule({
  name: 'Bridge',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});
const app = await Nexus.create(Bridge, { plugins: [devtools()] });
app.get(NAV_CHARTS).plot('Vega'); // -> 'Vega'
```

## Documentation

- [Introspection Guide](https://nexus.js.org/next/introspection/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/devtools/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
