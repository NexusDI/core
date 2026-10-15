# How do I find out what slows or stalls startup? examples

Regions for `apps/docs/content/profiling.mdx`. Every block runs as a test.

<!-- #region in-app -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile, profileTable } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface INavCharts {
  plot(target: string): string;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  private readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
  status() {
    return `online at ${this.reactor.output} GW`;
  }
}
class SubspaceRelay implements ISubspaceLink {
  readonly frequency = 1420;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});
const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering, Comms],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (link) => {
        await Promise.resolve(); // stands in for a download over the link
        return { plot: (target) => `course to ${target} on ${link.frequency}` };
      },
      deps: [SUBSPACE_LINK],
    }),
  ],
  exports: [COMPUTER, NAV_CHARTS],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

const profiler = profile();
await using ship = await Nexus.create(Meridian, { plugins: [profiler] });

const report = profiler.report();
const kinds = report.runs.map((r) => r.kind); // -> ['create']
console.log(kinds);
const charts = report.runs[0]?.builds.find((b) => b.token === 'NavCharts');
const async = charts?.async; // -> true
console.log(async);
console.log(profileTable(report));
```

<!-- #endregion in-app -->

<!-- #region in-app-sync -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface INavCharts {
  plot(target: string): string;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  private readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
  status() {
    return `online at ${this.reactor.output} GW`;
  }
}
class SubspaceRelay implements ISubspaceLink {
  readonly frequency = 1420;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});
const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering, Comms],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: (link) => ({
        plot: (target) => `course to ${target} on ${link.frequency}`,
      }),
      deps: [SUBSPACE_LINK],
    }),
  ],
  exports: [COMPUTER, NAV_CHARTS],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

const profiler = profile();
await using ship = await Nexus.create(Meridian, { plugins: [profiler] });

const report = profiler.report();
const kinds = report.runs.map((r) => r.kind); // -> ['create']
console.log(kinds);
const charts = report.runs[0]?.builds.find((b) => b.token === 'NavCharts');
const async = charts?.async; // -> false
console.log(async);
```

<!-- #endregion in-app-sync -->

<!-- #region critical-path -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { criticalPath, profile } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface INavCharts {
  plot(target: string): string;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  private readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
  status() {
    return `online at ${this.reactor.output} GW`;
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(NAV_CHARTS, {
      useFactory: async (computer) => {
        await Promise.resolve(); // stands in for a download the computer plots from
        return {
          plot: (target) => `course to ${target}, ${computer.status()}`,
        };
      },
      deps: [COMPUTER],
    }),
  ],
});

const profiler = profile();
await using ship = await Nexus.create(Meridian, { plugins: [profiler] });

const path = criticalPath(profiler.report(), 0);
const tokens = path?.path.map((p) => p.token); // -> ['ReactorCore', 'ShipComputer', 'NavCharts']
console.log(tokens);
const chained = path?.path.map((p) => p.dependsOnPrevious); // -> [false, true, true]
console.log(chained);
```

<!-- #endregion critical-path -->

<!-- #region critical-path-barrier -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { criticalPath, profile } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface INavCharts {
  plot(target: string): string;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  private readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
  status() {
    return `online at ${this.reactor.output} GW`;
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(NAV_CHARTS, {
      useFactory: async () => ({ plot: (target) => target }),
      deps: [],
    }),
  ],
});

const profiler = profile();
await using ship = await Nexus.create(Meridian, { plugins: [profiler] });

const path = criticalPath(profiler.report(), 0);
const tokens = path?.path.map((p) => p.token); // -> ['NavCharts', 'ShipComputer']
console.log(tokens);
const chained = path?.path.map((p) => p.dependsOnPrevious); // -> [false, false]
console.log(chained);
```

<!-- #endregion critical-path-barrier -->

<!-- #region stalled -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

interface INavCharts {
  plot(target: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(NAV_CHARTS, {
      // A download that never answers.
      useFactory: () => new Promise<INavCharts>(() => {}),
    }),
  ],
});

const profiler = profile();
void Nexus.create(Meridian, { plugins: [profiler] });
await new Promise((resolve) => setTimeout(resolve, 50));

const run = profiler.report().runs[0];
const settled = run?.ok; // -> null
console.log(settled);
const waiting = run?.pending.map((p) => `${p.token} ${p.what}`); // -> ['NavCharts construct']
console.log(waiting);
```

<!-- #endregion stalled -->

<!-- #region stalled-settled -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

interface INavCharts {
  plot(target: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async () => ({ plot: (target) => target }),
    }),
  ],
});

const profiler = profile();
void Nexus.create(Meridian, { plugins: [profiler] });
await new Promise((resolve) => setTimeout(resolve, 50));

const run = profiler.report().runs[0];
const settled = run?.ok; // -> true
console.log(settled);
const waiting = run?.pending.map((p) => `${p.token} ${p.what}`); // -> []
console.log(waiting);
```

<!-- #endregion stalled-settled -->

<!-- #region trace-file -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile, toChromeTrace, toPerfettoTrace } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Meridian, { plugins: [profiler] });
const report = profiler.report();

// Save each string as a .json file: the first opens in Chrome DevTools, the
// second in ui.perfetto.dev.
const chrome = JSON.stringify(toChromeTrace(report));
const perfetto = JSON.stringify(toPerfettoTrace(report));
const firstKey = (text: string) => Object.keys(JSON.parse(text))[0];
const keys = [firstKey(chrome), firstKey(perfetto)]; // -> ['traceEvents', 'traceEvents']
console.log(keys);
```

<!-- #endregion trace-file -->
