# What the trace events promise examples

Regions for `apps/docs/content/trace-events.mdx`. Every block runs as a test.

<!-- #region order -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

interface INavCharts {
  plot(target: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async () => {
        await Promise.resolve(); // stands in for a download
        return { plot: (target) => `course to ${target}` };
      },
    }),
  ],
});

const events: TraceEvent[] = [];
await using ship = await Nexus.create(Meridian, {
  plugins: [trace((event) => events.push(event))],
});
const types = events.map((e) => e.type); // -> ['compile', 'construct:await', 'construct', 'run']
console.log(types);
const runs = events.map((e) => ('run' in e ? e.run : null)); // -> [0, 0, 0, 0]
console.log(runs);
```

<!-- #endregion order -->

<!-- #region clock -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Meridian = defineModule({
  name: 'Meridian',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

const builds: TraceEvent<'construct'>[] = [];
await using ship = await Nexus.create(Meridian, {
  plugins: [
    trace((event) => {
      if (event.type === 'construct') builds.push(event);
    }),
  ],
});

const [reactor] = builds;
if (reactor === undefined) throw new Error('no construct event');
// A Chrome trace timestamp is in microseconds.
const chromeTs = Math.round(reactor.startMs * 1000);
// An OpenTelemetry start time is in Unix epoch milliseconds.
const unixMs = performance.timeOrigin + reactor.startMs;
const sameClock = reactor.startMs <= performance.now(); // -> true
console.log(sameClock, chromeTs > 0, new Date(unixMs).getFullYear() > 2000);
```

<!-- #endregion clock -->

<!-- #region third-party -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { NexusPlugin, TraceEvent } from '@nexusdi/core';

interface ISubspaceLink {
  send(message: string): Promise<void>;
}
interface INavCharts {
  plot(target: string): string;
}

const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

// Stand-ins for the network: the relay answers at once, and the chart
// download waits on a timer.
const relay = { transmit: async (_message: string) => {} };
const StarCharts = {
  async download(link: ISubspaceLink): Promise<INavCharts> {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await link.send('charts please');
    return { plot: (target) => `course to ${target}` };
  },
};

class SubspaceRelay implements ISubspaceLink {
  async send(message: string): Promise<void> {
    await relay.transmit(message);
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(SUBSPACE_LINK, { useClass: SubspaceRelay }),
    provide(NAV_CHARTS, {
      useFactory: (link) => StarCharts.download(link),
      deps: [SUBSPACE_LINK],
    }),
  ],
});

type Build = TraceEvent<'construct'>;
const own = (b: Build) => b.syncMs + (b.awaitMs ?? 0) + b.finishMs;

function slowest(top: number): NexusPlugin & { rows(): readonly Build[] } {
  const builds: Build[] = [];
  return {
    name: 'acme:slowest',
    apiVersion: NEXUS_PLUGIN_API,
    observe(event) {
      switch (event.type) {
        case 'construct':
          if (event.run === 0) builds.push(event);
          break;
        default:
          break; // a type this plugin does not know
      }
    },
    rows: () => [...builds].sort((a, b) => own(b) - own(a)).slice(0, top),
  };
}

const probe = slowest(5);
await using ship = await Nexus.create(Meridian, { plugins: [probe] });
const tokens = probe.rows().map((b) => b.token); // -> ['NavCharts', 'SubspaceLink']
console.log(tokens);
for (const b of probe.rows())
  console.log(b.token, b.level, b.awaitMs === null ? '' : 'async');
```

<!-- #endregion third-party -->
