# @nexusdi/devtools

`@nexusdi/devtools` shows what a NexusDI container compiled and what it did: `graph()` and `inspect()` return the module graph as plain JSON, and `trace()` hands each lifecycle event to a callback.

```bash
npm install @nexusdi/devtools @nexusdi/core
```

The version of `@nexusdi/devtools` must equal the version of `@nexusdi/core`.

## Graph and trace

`devtools()` registers `graph()` for a container and formats its errors with `@nexusdi/errors`. `trace(fn)` is a plugin that hands every lifecycle event to `fn`. Register `devtools()` in development only:

```ts
const dev = process.env.NODE_ENV !== 'production';

await using ship = await Nexus.create(Meridian, {
  plugins: dev ? [devtools()] : [],
});
```

<!-- #region graph -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, trace } from '@nexusdi/devtools';
import type { TraceEvent } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const events: TraceEvent[] = [];

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: ShipComputer }),
    ],
  }),
  { plugins: [devtools(), trace((event) => events.push(event))] },
);
graph(ship).edges; // -> [{ from: 'p1', to: 'p0', kind: 'required' }]
events.map((event) => event.type); // -> ['compile', 'construct', 'construct']
```

<!-- #endregion graph -->

`graph()` returns plain JSON. Ids are stable for a given set of definitions. Minifiers rename classes, so a production graph can show `t` in place of `ShipComputer`; give tokens a description, or keep class names, where names matter.

A factory's `async` in `graph()` says whether its last build returned a thenable.

A provider's `internal` is true for plumbing every graph lists, such as core's `REQUEST`. The renderers draw an internal provider only when a drawn provider depends on it. Ids are opaque strings: compare them, and never parse them.

## Text packs

`devtools({ text })` and `inspect(root, { text })` take the text packs `errors({ text })` takes, and read them in the same order: your packs in array order, then core's pack. Pass the pack of each package whose codes you want worded:

```ts
import { federationText } from '@nexusdi/federation/text';

const plugins = dev ? [devtools({ text: [federationText] })] : [];
```

## Notes

`devtools({ annotate })` and `inspect(root, { annotate })` take graph annotators. A `GraphAnnotator` reads the container's `BlueprintView` and returns `GraphNote`s, each a provider id and a label. Every provider in the graph has `notes`: the labels for its id, in annotator order, then in the order each annotator returned them. A provider no note names has `notes: []`, and a note for an id the view lacks is dropped. An annotator can match the shape with no import from `@nexusdi/devtools`.

<!-- #region annotate -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { BlueprintView } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const shielded = (view: BlueprintView) =>
  view.providers
    .filter((p) => p.kind === 'class')
    .map((p) => ({ provider: p.id, label: 'shielded' }));

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(REACTOR, { useClass: FusionReactor })],
  }),
  { plugins: [devtools({ annotate: [shielded] })] },
);
graph(ship).providers[0]?.notes; // -> ['shielded']
```

<!-- #endregion annotate -->

## Inspect

`inspect(root)` compiles the graph `Nexus.check` compiles and builds nothing, for a CLI or a CI job. It takes the root forms `Nexus.check` takes: a module, a provider array, or `{ providers, imports, exports }`. Every provider's `async` in its graph is `null`, since nothing ran.

`inspect()` passes `options.plugins` to `Nexus.check` and adds its own formatter after them, so an `errors()` or `devtools()` in your plugins words an error first. `options.text` goes to that formatter and never to `Nexus.check`.

<!-- #region inspect -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

inspect(Meridian).modules.map((module) => module.name); // -> ['Meridian', 'Engineering']
```

<!-- #endregion inspect -->

## Render

`toMermaid(graph)` and `toDot(graph)` turn a `NexusGraph` from `graph()` or `inspect()` into Mermaid or Graphviz DOT text. Both are pure functions with no dependencies, so they run in a browser too. `{ view: 'modules' }` draws the module import graph in place of the providers. The `nexusdi graph` command in `@nexusdi/cli` writes the same text, and SVG and PNG, from a shell.

<!-- #region render -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, toMermaid } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StellarCharts implements INavCharts {
  plot(to: string): string {
    return `course to ${to}`;
  }
}
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
  exports: [NAV_CHARTS],
});

toMermaid(inspect(Navigation)).split('\n')[2]; // -> '    p0["NavCharts<br/>StellarCharts"]'
```

<!-- #endregion render -->

Each provider shows its token, the class bound to it when the names differ, and what differs from a class singleton built at `create`. Exported providers have a heavy border, and every edge kind other than `required` carries its kind as a label.

`toMermaid` names each node by its position in the graph (`m0`, `p3`), because Mermaid reads a bare node name as syntax. A node name says nothing about the provider's id.

## Parse

`parseGraph(value)` reads a `NexusGraph` back from `JSON.parse` output, such as a file written with `JSON.stringify(graph(ship))`, and checks every field. It returns a copy. A value that is not a `NexusGraph` throws `DevtoolsError` with the code `NEXUS_DEVTOOLS_GRAPH_INVALID`, and its `path` names the first bad field, such as `providers[3].module`.

<!-- #region parse -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, parseGraph } from '@nexusdi/devtools';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StellarCharts implements INavCharts {
  plot(to: string): string {
    return `course to ${to}`;
  }
}
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
});

const saved = JSON.stringify(inspect(Navigation));
parseGraph(JSON.parse(saved)).providers[0]?.token; // -> 'NavCharts'
```

<!-- #endregion parse -->

## License

MIT
