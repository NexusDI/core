# Multi-providers examples

Regions for `apps/docs/content/multi-providers.mdx`. Every block runs as a test.

<!-- #region multi-token -->

```ts @import.meta.vitest
import { MultiToken, Nexus, provide } from '@nexusdi/core';

interface IDiagnostic {
  readonly system: string;
  check(): boolean;
}
const DIAGNOSTICS = new MultiToken<IDiagnostic>('Diagnostics');

class ReactorDiagnostic implements IDiagnostic {
  readonly system = 'reactor';
  check() {
    return true;
  }
}

await using ship = await Nexus.create([
  provide(DIAGNOSTICS, { useClass: ReactorDiagnostic }),
  provide(DIAGNOSTICS, { useValue: { system: 'hull', check: () => true } }),
]);
const systems = ship.get(DIAGNOSTICS).map((each) => each.system); // -> ['reactor', 'hull']
console.log(systems);
```

<!-- #endregion multi-token -->

<!-- #region panel -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  optional,
  provide,
} from '@nexusdi/core';

interface IDiagnostic {
  readonly system: string;
  check(): boolean;
}
interface ISubspaceLink {
  send(report: string): string;
}
interface IDiagnosticsPanel {
  report(): string;
}
const DIAGNOSTICS = new MultiToken<IDiagnostic>('Diagnostics');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class ReactorDiagnostic implements IDiagnostic {
  readonly system = 'reactor';
  check() {
    return true;
  }
}
class StatusBoard implements IDiagnosticsPanel {
  static deps = [all(DIAGNOSTICS), optional(SUBSPACE_LINK)] as const;
  constructor(
    private readonly checks: IDiagnostic[],
    private readonly link: ISubspaceLink | undefined,
  ) {}
  report() {
    const line = this.checks
      .map((each) => `${each.system} ${each.check() ? 'green' : 'red'}`)
      .join(', ');
    return this.link === undefined ? line : this.link.send(line);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(DIAGNOSTICS, { useClass: ReactorDiagnostic })],
  exports: [DIAGNOSTICS],
});
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(DIAGNOSTICS, { useValue: { system: 'hull', check: () => true } }),
  ],
  exports: [DIAGNOSTICS],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Tactical],
  providers: [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })],
});

await using ship = await Nexus.create(Meridian);
const report = ship.get(DIAGNOSTICS_PANEL).report(); // -> 'reactor green, hull green'
console.log(report);
```

<!-- #endregion panel -->

<!-- #region publish -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  provide,
} from '@nexusdi/core';

interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  summary(): string;
}
interface IDeckReport {
  count(): number;
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');
const DECK_REPORT = new Token<IDeckReport>('DeckReport');

// The library owns the token, and HealthService reads it.
class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  summary() {
    return this.checks
      .map((each) => `${each.system} ${each.check() ? 'green' : 'red'}`)
      .join(', ');
  }
}
const HealthModule = defineModule({
  name: 'Health',
  providers: [provide(HEALTH_MONITOR, { useClass: HealthService })],
  exports: [HEALTH_MONITOR],
});

// The application contributes. Each module imports the library and publishes
// its own records by exporting the token.
class ReactorCheck implements IHealthCheck {
  readonly system = 'reactor';
  check() {
    return true;
  }
}
class HullCheck implements IHealthCheck {
  readonly system = 'hull';
  check() {
    return false;
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  imports: [HealthModule],
  providers: [provide(HEALTH_CHECKS, { useClass: ReactorCheck })],
  exports: [HEALTH_CHECKS],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [HealthModule],
  providers: [provide(HEALTH_CHECKS, { useClass: HullCheck })],
  exports: [HEALTH_CHECKS],
});

// A second collector, in another module, reads the same list.
class DeckReport implements IDeckReport {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  count() {
    return this.checks.length;
  }
}
const Deck = defineModule({
  name: 'Deck',
  providers: [provide(DECK_REPORT, { useClass: DeckReport })],
  exports: [DECK_REPORT],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [HealthModule, Engineering, Tactical, Deck],
  }),
);
const summary = ship.get(HEALTH_MONITOR).summary(); // -> 'reactor green, hull red'
console.log(summary);
const seen = ship.get(DECK_REPORT).count(); // -> 2
console.log(seen);
```

<!-- #endregion publish -->

<!-- #region order -->

```ts @import.meta.vitest
import { MultiToken, Nexus, defineModule, provide } from '@nexusdi/core';

const SYSTEMS = new MultiToken<string>('Systems');

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(SYSTEMS, { useValue: 'reactor' }),
    provide(SYSTEMS, { useValue: 'coolant' }),
  ],
  exports: [SYSTEMS],
});
// Hangar comes first in the root's imports and imports Engineering itself.
const Hangar = defineModule({
  name: 'Hangar',
  imports: [Engineering],
  providers: [provide(SYSTEMS, { useValue: 'shuttle' })],
  exports: [SYSTEMS],
});
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(SYSTEMS, { useValue: 'hull' })],
  exports: [SYSTEMS],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Hangar, Engineering, Tactical] }),
);
const systems = ship.get(SYSTEMS); // -> ['shuttle', 'reactor', 'coolant', 'hull']
console.log(systems);
```

<!-- #endregion order -->

<!-- #region unexported -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  provide,
} from '@nexusdi/core';

interface IDiagnostic {
  readonly system: string;
  check(): boolean;
}
interface IDiagnosticsPanel {
  systems(): string[];
}
const DIAGNOSTICS = new MultiToken<IDiagnostic>('Diagnostics');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class ReactorDiagnostic implements IDiagnostic {
  readonly system = 'reactor';
  check() {
    return true;
  }
}
class StatusBoard implements IDiagnosticsPanel {
  static deps = [all(DIAGNOSTICS)] as const;
  constructor(private readonly checks: IDiagnostic[]) {}
  systems() {
    return this.checks.map((each) => each.system);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(DIAGNOSTICS, { useClass: ReactorDiagnostic })],
  exports: [DIAGNOSTICS],
});
// Tactical contributes to DIAGNOSTICS and does not export it.
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(DIAGNOSTICS, { useValue: { system: 'hull', check: () => true } }),
  ],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Engineering, Tactical],
    providers: [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })],
  }),
);
const systems = ship.get(DIAGNOSTICS_PANEL).systems(); // -> ['reactor']
console.log(systems);
```

<!-- #endregion unexported -->

<!-- #region lazy-all -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  lazy,
  provide,
} from '@nexusdi/core';

interface IBulletin {
  readonly text: string;
}
interface IHandler {
  handle(bulletin: IBulletin): void;
}
interface IEventBus {
  publish(bulletin: IBulletin): void;
}
const HANDLERS = new MultiToken<IHandler>('Handlers');
const EVENT_BUS = new Token<IEventBus>('EventBus');

// The bus owns the cycle: it takes the handlers lazily, once.
class SubspaceBus implements IEventBus {
  static deps = [lazy(all(HANDLERS))] as const;
  constructor(private readonly handlers: () => IHandler[]) {}
  publish(bulletin: IBulletin) {
    for (const each of this.handlers()) each.handle(bulletin);
  }
}
// The handlers publish, so they depend on the bus. None of them writes lazy().
class AlertHandler implements IHandler {
  static deps = [EVENT_BUS] as const;
  constructor(private readonly bus: IEventBus) {}
  handle(bulletin: IBulletin) {
    if (bulletin.text === 'hull breach')
      this.bus.publish({ text: 'all hands' });
  }
}
const heard: string[] = [];
class LogHandler implements IHandler {
  handle(bulletin: IBulletin) {
    heard.push(bulletin.text);
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    providers: [
      provide(EVENT_BUS, { useClass: SubspaceBus }),
      provide(HANDLERS, { useClass: AlertHandler }),
      provide(HANDLERS, { useClass: LogHandler }),
    ],
  }),
);
ship.get(EVENT_BUS).publish({ text: 'hull breach' });
const log = [...heard]; // -> ['all hands', 'hull breach']
console.log(log);
```

<!-- #endregion lazy-all -->

<!-- #region lazy-all-cycle -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';

interface IHandler {
  handle(): void;
}
interface IEventBus {
  publish(): void;
}
const HANDLERS = new MultiToken<IHandler>('Handlers');
const EVENT_BUS = new Token<IEventBus>('EventBus');

// The bus takes all() without lazy(), so the bus and its handler form a cycle.
class SubspaceBus implements IEventBus {
  static deps = [all(HANDLERS)] as const;
  constructor(private readonly handlers: IHandler[]) {}
  publish() {
    for (const each of this.handlers) each.handle();
  }
}
class AlertHandler implements IHandler {
  static deps = [EVENT_BUS] as const;
  constructor(private readonly bus: IEventBus) {}
  handle() {
    this.bus.publish();
  }
}

const error = await Nexus.create(
  defineModule({
    name: 'Meridian',
    providers: [
      provide(EVENT_BUS, { useClass: SubspaceBus }),
      provide(HANDLERS, { useClass: AlertHandler }),
    ],
  }),
).catch((caught: unknown) => caught);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_BLUEPRINT_INVALID'
console.log(code);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const cycle = isNexusError(inner) ? inner.code : null; // -> 'NEXUS_CIRCULAR_DEPENDENCY'
console.log(cycle);
```

<!-- #endregion lazy-all-cycle -->
