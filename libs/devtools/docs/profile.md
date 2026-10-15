# Devtools startup profiler examples

Regions for the profiler's entries on `/api-devtools/`. Every block runs as a test.

## Record a startup with `profile()`

`profile()` returns a plugin that records each create and load of one container. `report()` returns what it recorded as plain JSON.

<!-- #region profile -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
const report = profiler.report();
const kinds = report.runs.map((run) => run.kind); // -> ['create']
const built = report.runs[0]?.builds.map((build) => build.token); // -> ['ReactorCore', 'ShipComputer']
```

<!-- #endregion profile -->

## One startup with `profileStartup()`

`profileStartup(root)` creates a container with a profiler, disposes it, and resolves to the report.

<!-- #region profile-startup -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { profileStartup } from '@nexusdi/devtools';

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

const report = await profileStartup(Engineering);
const kinds = report.runs.map((run) => run.kind); // -> ['create']
const disposeErrors = report.dispose?.errors; // -> 0
```

<!-- #endregion profile-startup -->

## The table with `profileTable()`

`profileTable(report)` returns the table `nexusdi profile` prints, as a string.

<!-- #region profile-table -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile, profileTable } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
const report = profiler.report();
const table = profileTable(report);
const namesComputer = table.includes('ShipComputer'); // -> true
```

<!-- #endregion profile-table -->

## The critical path with `criticalPath()`

`criticalPath(report, runId)` returns the chain of builds that bounds the build step of the run with that id.

<!-- #region critical-path-run -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { criticalPath, profile } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
const report = profiler.report();
const [run] = report.runs;
const path = run && criticalPath(report, run.id);
const tokens = path?.path.map((member) => member.token); // -> ['ReactorCore', 'ShipComputer']
```

<!-- #endregion critical-path-run -->

## Draw each run with `liveSink()`

`liveSink()` from `@nexusdi/devtools/live` draws each run in the Chrome DevTools Performance panel. Outside Chromium 134 and later it returns `undefined`, and the profiler draws nothing.

<!-- #region live-sink -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';
import { liveSink } from '@nexusdi/devtools/live';

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

// undefined outside Chromium 134 and later, so this run in Node draws nothing.
const sink = liveSink(); // -> undefined
const profiler = profile({ live: sink });
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
```

<!-- #endregion live-sink -->

## Read a saved report with `parseProfileReport()`

`parseProfileReport(value)` checks a parsed JSON value against the report's shape and returns it typed.

<!-- #region parse-report -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { parseProfileReport, profile } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
const report = profiler.report();
const saved = JSON.stringify(report);
const read = parseProfileReport(JSON.parse(saved));
const format = read.format; // -> 'nexusdi-profile'
let code = '';
try {
  parseProfileReport({ format: 'nexusdi-profile', version: 2 });
} catch (error) {
  code = isNexusError(error) ? error.code : '';
}
code; // -> 'NEXUS_DEVTOOLS_PROFILE_INVALID'
```

<!-- #endregion parse-report -->

## A Chrome DevTools trace with `toChromeTrace()`

`toChromeTrace(report)` returns a trace file that the Chrome DevTools Performance panel loads, with the runs in one `NexusDI` track group.

<!-- #region chrome-trace -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile, toChromeTrace } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
const report = profiler.report();
const trace = toChromeTrace(report);
const hasEvents = trace.traceEvents.length > 0; // -> true
```

<!-- #endregion chrome-trace -->

## A Perfetto trace with `toPerfettoTrace()`

`toPerfettoTrace(report)` returns a trace file for ui.perfetto.dev, with one thread for the steps and one per built provider.

<!-- #region perfetto-trace -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile, toPerfettoTrace } from '@nexusdi/devtools';

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

const profiler = profile();
await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
const report = profiler.report();
const trace = toPerfettoTrace(report);
const threads = trace.traceEvents.filter(
  (event) => event['name'] === 'thread_name',
);
const tracks = threads.map((event) => (event['args'] as { name: string }).name); // -> ['steps', 'ReactorCore', 'ShipComputer']
```

<!-- #endregion perfetto-trace -->
