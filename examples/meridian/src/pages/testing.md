# How do I replace a provider in a test? examples

Regions for `apps/docs/content/testing.mdx`. Every block runs as a test.

<!-- #region unit-test -->

```ts @import.meta.vitest
interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}

class QuantumComputer implements IShipComputer {
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

const fakeReactor: IReactorCore = { output: 0.5 };
const status = new QuantumComputer(fakeReactor).status(); // -> 'ShipComputer online. Reactor output 0.5 GW.'
console.log(status);
```

<!-- #endregion unit-test -->

<!-- #region override-reactor -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

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
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}
class FakeReactor implements IReactorCore {
  readonly output = 0.5;
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

await using ship = await createTestingContainer(Meridian)
  .override(REACTOR, { useClass: FakeReactor })
  .create();
const status = ship.get(COMPUTER).status(); // -> 'ShipComputer online. Reactor output 0.5 GW.'
console.log(status);
```

<!-- #endregion override-reactor -->

<!-- #region override-breaks-graph -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ChartedReactor implements IReactorCore {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  readonly output = 0.5;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

const error = await createTestingContainer(Engineering)
  .override(REACTOR, { useClass: ChartedReactor })
  .create()
  .catch((caught: unknown) => caught);
const errors = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = errors.map((inner) => inner.code); // -> ['NEXUS_MISSING_PROVIDER']
console.log(codes);
```

<!-- #endregion override-breaks-graph -->

<!-- #region override-unused -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const fakeCharts: INavCharts = { plot: (to) => `loopback course to ${to}` };

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

const error = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create()
  .catch((caught: unknown) => caught);
const errors = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const message = errors[0]?.message; // -> '[NEXUS_OVERRIDE_UNUSED] override(NavCharts) matched no provider in the module graph.\n  Fix: remove the override, or import the module that provides NavCharts.'
console.log(message);
```

<!-- #endregion override-unused -->

<!-- #region override-module -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface ISubspaceLink {
  send(message: string): string;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  send(message: string) {
    return `relayed ${message}`;
  }
}
class LoopbackLink implements ISubspaceLink {
  send(message: string) {
    return `loopback ${message}`;
  }
}

const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const CommsStub = defineModule({
  name: 'CommsStub',
  providers: [provide(SUBSPACE_LINK, { useClass: LoopbackLink })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Comms] });

await using ship = await createTestingContainer(Meridian)
  .overrideModule(Comms, CommsStub)
  .create();
const reply = ship.get(SUBSPACE_LINK).send('hail'); // -> 'loopback hail'
console.log(reply);
```

<!-- #endregion override-module -->

<!-- #region override-lifetime -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface ISurveyDrone {
  readonly serial: number;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

let launched = 0;
class ScoutDrone implements ISurveyDrone {
  readonly serial = ++launched;
}
class TrainingDrone implements ISurveyDrone {
  readonly serial = 0;
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
  exports: [DRONE],
});

await using ship = await createTestingContainer(Tactical)
  .override(DRONE, { useClass: TrainingDrone })
  .create();
const distinct = ship.get(DRONE) !== ship.get(DRONE); // -> true
console.log(distinct);
```

<!-- #endregion override-lifetime -->

<!-- #region shared-builder -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IReactorCore {
  readonly output: number;
  onInit?(): void;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

const log: string[] = [];
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  onInit() {
    log.push('reactor online');
  }
}
class FakeReactor implements IReactorCore {
  readonly output = 0.5;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

const base = createTestingContainer(Engineering);

await using quiet = await base.create({ onInit: false });
const skipped = log.length; // -> 0
console.log(skipped);

await using faked = await base
  .override(REACTOR, { useClass: FakeReactor })
  .create();
const output = faked.get(REACTOR).output; // -> 0.5
console.log(output);

await using real = await base.create();
const realOutput = real.get(REACTOR).output; // -> 1.21
console.log(realOutput);
```

<!-- #endregion shared-builder -->

<!-- #region vitest-fixtures -->

```ts @import.meta.vitest @module
import { defineModule, provide, Token } from '@nexusdi/core';
import {
  interceptors,
  type CallContext,
  type Interceptor,
  type Next,
} from '@nexusdi/interceptors';
import { nexusTest } from '@nexusdi/vitest';
import { describe, test as base } from 'vitest';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
interface IAuditLog {
  record(call: string): void;
  readonly calls: readonly string[];
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const AUDIT_LOG = new Token<IAuditLog>('AuditLog');

class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
class AuditLog implements IAuditLog {
  readonly calls: string[] = [];
  record(call: string) {
    this.calls.push(call);
  }
}
/** Records each NAV_CHARTS call in the audit log. */
class NavAudit implements Interceptor {
  static deps = [AUDIT_LOG] as const;
  readonly #log: IAuditLog;
  constructor(log: IAuditLog) {
    this.#log = log;
  }
  intercept(call: CallContext, next: Next) {
    this.#log.record(`${String(call.method)} ${call.args.join(' ')}`);
    return next();
  }
}

const Audit = defineModule({
  name: 'Audit',
  providers: [provide(AUDIT_LOG, { useClass: AuditLog })],
  exports: [AUDIT_LOG],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Audit],
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

// A class, so the interceptor wraps it: interceptors skip a useValue.
class FakeCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 42 };
  }
}
const unplottable: INavCharts = {
  plot: () => {
    throw new Error('sector not charted');
  },
};

const test = nexusTest(base, Tactical, {
  setup: (builder) => builder.override(NAV_CHARTS, { useClass: FakeCharts }),
  create: {
    plugins: [
      interceptors({
        imports: [Audit],
        register: [NavAudit],
        bindings: [{ token: NAV_CHARTS, class: [NavAudit] }],
      }),
    ],
  },
});

test('plots with the fake charts', ({ nexus }) => {
  nexus.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
  nexus.get(AUDIT_LOG).calls; // -> ['plot Kepler-442b']
});

describe('when the charts cannot plot', () => {
  test.override('nexusSetup', [
    (builder) => builder.override(NAV_CHARTS, { useValue: unplottable }),
  ]);

  test('reports an uncharted sector', ({ nexus }) => {
    let reason = '';
    try {
      nexus.get(NAV_CHARTS).plot('Kepler-442b');
    } catch (error) {
      reason = (error as Error).message;
    }
    reason; // -> 'sector not charted'
    nexus.get(AUDIT_LOG).calls; // -> []
  });
});
```

<!-- #endregion vitest-fixtures -->

<!-- #region loader-scope -->

```ts @import.meta.vitest @module
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { existingScope, NEXUS_SCOPE, nexus } from '@nexusdi/react-router';
import { nexusTest } from '@nexusdi/vitest';
import { RouterContextProvider } from 'react-router';
import { test as base } from 'vitest';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  readonly #mission: Mission;
  constructor(mission: Mission) {
    this.#mission = mission;
  }
  record(entry: string) {
    this.#entries.push(`${this.#mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}
const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

// app/nexus.server.ts
const ship = await Nexus.create(BridgeApi);
const di = nexus(ship, {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

// app/routes/course.tsx
interface LoaderArgs {
  params: { to: string };
  context: RouterContextProvider;
}
const loader = di.inject(
  { log: FLIGHT_LOG },
  ({ log }, { params }: LoaderArgs) => {
    log.record(`plotting ${params.to}`);
    return log.entries();
  },
);

// app/routes/course.test.ts
const test = nexusTest(base, BridgeApi);
test.override('nexusRequest', {
  mission: { id: 'survey-9', target: 'Kepler-442b' },
});

test('the loader records under the test mission', async ({ nexusScope }) => {
  const context = new RouterContextProvider(
    new Map([[NEXUS_SCOPE, existingScope(nexusScope)]]),
  );
  const entries = await loader({ params: { to: 'Kepler-442b' }, context }); // -> ['survey-9: plotting Kepler-442b']
});
```

<!-- #endregion loader-scope -->
