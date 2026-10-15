# Providers

## Providers

`provide()` binds a token to a value, an alias, a transient class or a `MultiToken` contribution.

<!-- #region providers -->

```ts @import.meta.vitest
import { MultiToken, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';

interface IDiagnostic {
  run(): boolean;
}
interface IDrone {
  readonly serial: number;
}
const DIAGNOSTICS = new MultiToken<IDiagnostic>('Diagnostics');
const CALLSIGN = new Token<string>('Callsign');
const HAIL = new Token<string>('Hail');
const DRONE = new Token<IDrone>('SurveyDrone');

let built = 0;
class SurveyDrone implements IDrone {
  readonly serial = ++built;
}

const Hangar = defineModule({
  name: 'Hangar',
  providers: [
    provide(CALLSIGN, { useValue: 'Meridian' }),
    provide(HAIL, { useExisting: CALLSIGN }),
    provide(DRONE, { useClass: SurveyDrone, lifetime: 'transient' }),
    provide(DIAGNOSTICS, { useValue: { run: () => true } }),
    provide(DIAGNOSTICS, { useValue: { run: () => false } }),
  ],
});

await using ship = await Nexus.create(Hangar);
ship.get(HAIL); // -> 'Meridian'
ship.get(DRONE) === ship.get(DRONE); // -> false
ship.get(DIAGNOSTICS).map((check) => check.run()); // -> [true, false]
```

<!-- #endregion providers -->

## Object literals

`providers` also takes the 0.3 object shape, `{ token, ... }`.

<!-- #region provider-literals -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const CALLSIGN = new Token<string>('Callsign');
const STATUS = new Token<string>('Status');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    { token: REACTOR, useClass: FusionReactor },
    { token: CALLSIGN, useValue: 'Meridian' },
    {
      token: STATUS,
      useFactory: (callsign: string, core: IReactorCore) =>
        `${callsign} at ${core.output} GW`,
      deps: [CALLSIGN, REACTOR],
    },
  ],
});

await using ship = await Nexus.create(Bridge);
ship.get(STATUS); // -> 'Meridian at 1.21 GW'
```

<!-- #endregion provider-literals -->

## Built on first use

A singleton with `eager: false` builds on its first `get()`.

<!-- #region startup-cost -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IDatabase {
  query(sql: string): string;
}
const DATABASE = new Token<IDatabase>('Database');

const log: string[] = [];
class PostgresClient implements IDatabase {
  constructor() {
    log.push('connect');
  }
  query(sql: string) {
    return `ran ${sql}`;
  }
}

await using app = await Nexus.create(
  defineModule({
    name: 'Api',
    providers: [provide(DATABASE, { useClass: PostgresClient, eager: false })],
  }),
);
log; // -> []
app.get(DATABASE).query('select 1'); // -> 'ran select 1'
log; // -> ['connect']
```

<!-- #endregion startup-cost -->

## Cycles

`lazy(T)` resolves a dependency cycle through a thunk.

<!-- #region lazy -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

interface IShieldGrid {
  draw(): number;
}
interface IPowerRouter {
  divert(): number;
}
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

class ShieldGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}
class PowerRouter implements IPowerRouter {
  static deps = [lazy(SHIELD_GRID)] as const;
  constructor(private readonly shields: () => IShieldGrid) {}
  divert() {
    return this.shields().draw();
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PowerRouter }),
      provide(SHIELD_GRID, { useClass: ShieldGrid }),
    ],
  }),
);
ship.get(POWER_ROUTER).divert(); // -> 0.4
```

<!-- #endregion lazy -->

## Optional deps

`optional(TOKEN)` marks a dep the provider can run without: with no provider of the token visible, the dep resolves to `undefined`. `StatusBoard` returns its report with `held` appended when no provider of `SUBSPACE_LINK` is visible.

<!-- #region optional -->

```ts @import.meta.vitest
import { MultiToken, Nexus, Token, all, optional } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';

interface Diagnostic {
  readonly name: string;
  check(): boolean;
}
interface ISubspaceLink {
  send(message: string): string;
}
interface IDiagnosticsPanel {
  passed(): string[];
  report(): string;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class StatusBoard implements IDiagnosticsPanel {
  static deps = [all(DIAGNOSTICS), optional(SUBSPACE_LINK)] as const;
  constructor(
    private readonly diagnostics: Diagnostic[],
    private readonly link: ISubspaceLink | undefined,
  ) {}
  passed() {
    return this.diagnostics
      .filter((diagnostic) => diagnostic.check())
      .map((diagnostic) => diagnostic.name);
  }
  report() {
    const text = `${this.passed().length} of ${this.diagnostics.length} passed`;
    return this.link ? this.link.send(text) : `${text}, held`;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    providers: [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })],
  }),
);
ship.get(DIAGNOSTICS_PANEL).report(); // -> '0 of 0 passed, held'
```

<!-- #endregion optional -->

## Every contribution of a MultiToken

`all(TOKEN)` collects a `MultiToken`: the dep resolves to every contribution visible to the provider, in the order `Nexus.create` walks the modules, and in declaration order inside one module. `StatusBoard` runs the diagnostics `Engineering` and `Tactical` contribute.

<!-- #region all -->

```ts @import.meta.vitest
import { MultiToken, Nexus, Token, all, optional } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';

interface Diagnostic {
  readonly name: string;
  check(): boolean;
}
interface ISubspaceLink {
  send(message: string): string;
}
interface IDiagnosticsPanel {
  passed(): string[];
  report(): string;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class StatusBoard implements IDiagnosticsPanel {
  static deps = [all(DIAGNOSTICS), optional(SUBSPACE_LINK)] as const;
  constructor(
    private readonly diagnostics: Diagnostic[],
    private readonly link: ISubspaceLink | undefined,
  ) {}
  passed() {
    return this.diagnostics
      .filter((diagnostic) => diagnostic.check())
      .map((diagnostic) => diagnostic.name);
  }
  report() {
    const text = `${this.passed().length} of ${this.diagnostics.length} passed`;
    return this.link ? this.link.send(text) : `${text}, held`;
  }
}

class ReactorDiagnostic implements Diagnostic {
  readonly name = 'reactor';
  check() {
    return true;
  }
}
const hullDiagnostic: Diagnostic = { name: 'hull', check: () => false };

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(DIAGNOSTICS, { useClass: ReactorDiagnostic })],
  exports: [DIAGNOSTICS],
});
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(DIAGNOSTICS, { useValue: hullDiagnostic })],
  exports: [DIAGNOSTICS],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Engineering, Tactical],
    providers: [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })],
  }),
);
ship.get(DIAGNOSTICS_PANEL).passed(); // -> ['reactor']
ship.get(DIAGNOSTICS_PANEL).report(); // -> '1 of 2 passed, held'
```

<!-- #endregion all -->
