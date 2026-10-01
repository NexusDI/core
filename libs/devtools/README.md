# @nexusdi/devtools

[![npm](https://img.shields.io/npm/v/@nexusdi/devtools/next)](https://www.npmjs.com/package/@nexusdi/devtools) [![license](https://img.shields.io/npm/l/@nexusdi/devtools)](https://github.com/NexusDI/core/blob/main/LICENSE)

Draw your NexusDI module graph and follow every instance the container builds.

`devtools()` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that hands you the compiled module graph and words each error with its fix. Register it in development to see which module provides each token and what the container built.

- `graph()` returns the module graph as plain JSON.
- `toMermaid()` and `toDot()` draw it, in Node or a browser.
- `inspect()` compiles a module graph and builds nothing.
- `trace()` reports each lifecycle event as it happens.

<img src="https://raw.githubusercontent.com/NexusDI/core/release/0.4/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: Bridge provides Helm and ShipLog; Engineering provides ShipComputer, Reactor and the async NavCharts factory." width="720">

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

```bash
npm install @nexusdi/devtools@next @nexusdi/core@next
```

## Usage

<!-- #region devtools -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, toMermaid } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

await using ship = await Nexus.create(Navigation, { plugins: [devtools()] });
graph(ship).modules.map((module) => module.name); // -> ['Navigation']
toMermaid(graph(ship)).split('\n')[2]; // -> '    p0["NavCharts<br/>StarCharts"]'
```

<!-- #endregion devtools -->

## Trace

`trace(fn)` is a plugin that hands every lifecycle event to `fn`.

<!-- #region trace -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { trace, type TraceEvent } from '@nexusdi/devtools';

interface IReactor {
  readonly output: number;
}
const REACTOR = new Token<IReactor>('Reactor');
class FusionReactor implements IReactor {
  readonly output = 42;
}
const events: TraceEvent[] = [];
const plugins = [trace((event) => events.push(event))];
await using ship = await Nexus.create(
  [provide(REACTOR, { useClass: FusionReactor })],
  { plugins },
);
events.map((event) => event.type); // -> ['compile', 'construct']
```

<!-- #endregion trace -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/devtools/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
