# Multi-providers examples

Regions for `apps/docs/content/multi-providers.mdx`. Every block runs as a test.

<!-- #region multi-token -->

```ts @import.meta.vitest
import { MultiToken, Nexus, provide } from '@nexusdi/core';

interface Diagnostic {
  readonly system: string;
  check(): boolean;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');

class ReactorDiagnostic implements Diagnostic {
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
import { MultiToken, Nexus, Token, all, defineModule } from '@nexusdi/core';
import { optional, provide } from '@nexusdi/core';

interface Diagnostic {
  readonly system: string;
  check(): boolean;
}
interface ISubspaceLink {
  send(report: string): string;
}
interface IDiagnosticsPanel {
  report(): string;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class ReactorDiagnostic implements Diagnostic {
  readonly system = 'reactor';
  check() {
    return true;
  }
}
class StatusBoard implements IDiagnosticsPanel {
  static deps = [all(DIAGNOSTICS), optional(SUBSPACE_LINK)] as const;
  constructor(
    private readonly checks: Diagnostic[],
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
import { MultiToken, Nexus, Token, all, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

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
import { MultiToken, Nexus, Token, all, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface Diagnostic {
  readonly system: string;
  check(): boolean;
}
interface IDiagnosticsPanel {
  systems(): string[];
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class ReactorDiagnostic implements Diagnostic {
  readonly system = 'reactor';
  check() {
    return true;
  }
}
class StatusBoard implements IDiagnosticsPanel {
  static deps = [all(DIAGNOSTICS)] as const;
  constructor(private readonly checks: Diagnostic[]) {}
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
