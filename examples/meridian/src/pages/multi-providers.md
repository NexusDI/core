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
