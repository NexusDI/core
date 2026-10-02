# How do I upgrade from 0.3 to 0.4? examples

Regions for `apps/docs/content/upgrade.mdx`. Every block runs as a test.

<!-- #region tokens -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

await using ship = await Nexus.create([
  provide(NAV_CHARTS, {
    useValue: { plot: (to: string) => `course to ${to}` },
  }),
]);
const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
const name = NAV_CHARTS.description; // -> 'NavCharts'
console.log(name);
```

<!-- #endregion tokens -->

<!-- #region services -->

```ts @import.meta.vitest
import { Nexus, Token, optional, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IShipComputer {
  status(): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR, optional(SUBSPACE_LINK)] as const;
  constructor(
    private readonly reactor: IReactorCore,
    private readonly link: ISubspaceLink | undefined,
  ) {}
  status() {
    const link = this.link === undefined ? 'no link' : 'linked';
    return `Reactor output ${this.reactor.output} GW, ${link}.`;
  }
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);
const status = ship.get(COMPUTER).status(); // -> 'Reactor output 1.21 GW, no link.'
console.log(status);
```

<!-- #endregion services -->

<!-- #region modules -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: CommsOptions) {
    this.frequency = options.frequency;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Comms.forRoot({ frequency: 1420 })],
  }),
);
const frequency = ship.get(SUBSPACE_LINK).frequency; // -> 1420
console.log(frequency);
```

<!-- #endregion modules -->

<!-- #region module-exports -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

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
    return `Reactor output ${this.reactor.output} GW.`;
  }
}

// Engineering provides REACTOR but does not export it.
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering],
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Tactical).catch((caught: unknown) => caught);
const errors = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = errors.map((inner) => inner.code); // -> ['NEXUS_MISSING_PROVIDER']
console.log(codes);
```

<!-- #endregion module-exports -->

<!-- #region bootstrap -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

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
    return `Reactor output ${this.reactor.output} GW.`;
  }
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(COMPUTER, { useClass: QuantumComputer }),
]);
const status = ship.get(COMPUTER).status(); // -> 'Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion bootstrap -->

<!-- #region provider-literals -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const CALLSIGN = new Token<string>('Callsign');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    { token: REACTOR, useClass: FusionReactor },
    { token: CALLSIGN, useValue: 'Meridian' },
  ],
});

await using ship = await Nexus.create(Engineering);
const callsign = ship.get(CALLSIGN); // -> 'Meridian'
console.log(callsign);
```

<!-- #endregion provider-literals -->

<!-- #region scopes -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

await using ship = await Nexus.create(Tactical);
await using shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const target = shuttle.get(MISSION).target; // -> 'Kepler-442b'
console.log(target);
```

<!-- #endregion scopes -->

<!-- #region eager-false -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const log: string[] = [];
class StarCharts implements INavCharts {
  constructor() {
    log.push('charts loaded');
  }
  plot(to: string) {
    return `course to ${to}`;
  }
}

await using ship = await Nexus.create([
  provide(NAV_CHARTS, { useClass: StarCharts, eager: false }),
]);
const atStartup = log.length; // -> 0
console.log(atStartup);
ship.get(NAV_CHARTS);
const afterGet = log.length; // -> 1
console.log(afterGet);
```

<!-- #endregion eager-false -->

<!-- #region tests -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}
const fakeCharts: INavCharts = { plot: () => 'loopback' };

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

await using ship = await createTestingContainer(Tactical)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'loopback'
console.log(course);
```

<!-- #endregion tests -->

<!-- #region errors -->

```ts @import.meta.vitest
import { MissingProviderError, Nexus, Token } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const error = await Nexus.create(
  [provide(COMPUTER, { useClass: QuantumComputer })],
  {
    plugins: [errors()],
  },
).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const first = inner[0];
const isMissing = first instanceof MissingProviderError; // -> true
console.log(isMissing);
const code = first?.code; // -> 'NEXUS_MISSING_PROVIDER'
console.log(code);
const message = first?.message.split('\n')[0]; // -> '[NEXUS_MISSING_PROVIDER] ShipComputer (module root) depends on NavCharts, but no provider of NavCharts is visible in root.'
console.log(message);
```

<!-- #endregion errors -->

<!-- #region has-visibility -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

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

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Engineering] }),
);
const privateToken = ship.has(REACTOR); // -> false
console.log(privateToken);
```

<!-- #endregion has-visibility -->
