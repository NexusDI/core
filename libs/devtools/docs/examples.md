# Devtools examples

## Graph and trace

`graph()` returns the compiled graph, and `trace()` reports each lifecycle event.

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

## Notes

An annotator adds labels to the providers it names.

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

`inspect()` compiles a module graph and builds nothing.

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

`toMermaid()` draws a graph as Mermaid text.

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

## Parse

`parseGraph()` reads a saved graph back and checks every field.

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
