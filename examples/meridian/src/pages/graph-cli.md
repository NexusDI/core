# How do I draw my app's dependency graph? examples

Regions for `apps/docs/content/graph-cli.mdx`. Every block runs as a test.

<!-- #region meridian-module -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, toMermaid } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `online at ${this.reactor.output} GW`;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

const mermaid = toMermaid(inspect(Meridian));
const lines = mermaid.split('\n'); // -> ['flowchart LR', '  subgraph m1["Engineering"]', '    p0["ReactorCore<br/>FusionReactor"]', '    p1["ShipComputer<br/>QuantumComputer"]', '  end', '  p1 --> p0', '  classDef exported stroke-width:3px', '  class p1 exported', '']
console.log(mermaid);
```

<!-- #endregion meridian-module -->

<!-- #region modules-view -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, toMermaid } from '@nexusdi/devtools';

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

const modules = toMermaid(inspect(Meridian), { view: 'modules' });
const lines = modules.split('\n'); // -> ['flowchart LR', '  m0["Meridian<br/>0 providers"]', '  m1["Engineering<br/>1 provider"]', '  m0 --> m1', '']
console.log(modules);
```

<!-- #endregion modules-view -->

<!-- #region parse-json -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph, parseGraph } from '@nexusdi/devtools';

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
});

await using ship = await Nexus.create(Engineering, { plugins: [devtools()] });
const saved = JSON.stringify(graph(ship));

const read = parseGraph(JSON.parse(saved));
const reactor = read.providers.find(
  (provider) => provider.token === 'ReactorCore',
);
const built = reactor?.implementation; // -> 'FusionReactor'
console.log(built);
```

<!-- #endregion parse-json -->

<!-- #region parse-invalid -->

```ts @import.meta.vitest
import { isNexusError } from '@nexusdi/core';
import { parseGraph } from '@nexusdi/devtools';

const edited = {
  modules: [],
  providers: [{ id: 'p0', token: 'ReactorCore' }],
  edges: [],
};

let error: unknown;
try {
  parseGraph(edited);
} catch (caught) {
  error = caught;
}
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_DEVTOOLS_GRAPH_INVALID'
console.log(code);
const invalid = isNexusError(error, 'NEXUS_DEVTOOLS_GRAPH_INVALID')
  ? error
  : null;
const path = invalid?.path; // -> 'providers[0].module'
console.log(path);
const lines = isNexusError(error) ? error.message.split('\n') : []; // -> ['[NEXUS_DEVTOOLS_GRAPH_INVALID] not a NexusGraph: providers[0].module is missing or has the wrong type.', '  Fix: pass JSON.parse of the text that JSON.stringify(graph(ship)), JSON.stringify(inspect(root)) or nexusdi graph --format json wrote.']
console.log(lines.join('\n'));
```

<!-- #endregion parse-invalid -->
