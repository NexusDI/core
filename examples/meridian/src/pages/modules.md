# Modules examples

Regions for `apps/docs/content/modules.mdx`. Every block runs as a test.

<!-- #region exports -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IPowerRouter {
  divert(): number;
}
interface IShipComputer {
  status(): string;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class PlasmaRouter implements IPowerRouter {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  divert() {
    return this.reactor.output / 2;
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [POWER_ROUTER] as const;
  constructor(private readonly router: IPowerRouter) {}
  status() {
    return `ShipComputer online on ${this.router.divert()} GW.`;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(POWER_ROUTER, { useClass: PlasmaRouter }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});

const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using ship = await Nexus.create(Meridian);

const status = ship.get(COMPUTER).status(); // -> 'ShipComputer online on 0.605 GW.'
console.log(status);

const routerVisible = ship.has(POWER_ROUTER); // -> false
console.log(routerVisible);

const inside = ship.get(POWER_ROUTER, { module: Engineering }).divert(); // -> 0.605
console.log(inside);
```

<!-- #endregion exports -->

<!-- #region not-visible -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';

interface IPowerRouter {
  divert(): number;
}

const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

class PlasmaRouter implements IPowerRouter {
  divert() {
    return 0.605;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(POWER_ROUTER, { useClass: PlasmaRouter })],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Engineering] }),
);

let message: string | null = null;
try {
  ship.get(POWER_ROUTER);
} catch (error) {
  if (!isNexusError(error)) throw error;
  message = error.message;
}
const seen = message; // -> '[NEXUS_NOT_VISIBLE] token=PowerRouter owners=Engineering. https://nexus.js.org/errors/NEXUS_NOT_VISIBLE'
console.log(seen);
```

<!-- #endregion not-visible -->

<!-- #region missing-export -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface ISurveyDrone {
  readonly range: number;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ScoutDrone implements ISurveyDrone {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  get range() {
    return this.reactor.output * 10;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering],
  providers: [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
  exports: [DRONE],
});

let outcome: string;
try {
  await using ship = await Nexus.create(
    defineModule({ name: 'Meridian', imports: [Tactical] }),
  );
  outcome = `range ${ship.get(DRONE).range}`;
} catch (caught) {
  if (!isNexusError(caught, 'NEXUS_BLUEPRINT_INVALID')) throw caught;
  outcome = caught.errors[0]?.message ?? 'no error';
}

const result = outcome; // -> '[NEXUS_MISSING_PROVIDER] token=ReactorCore requester=SurveyDrone module=Tactical. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
console.log(result);
```

<!-- #endregion missing-export -->

<!-- #region global -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface ISurveyDrone {
  readonly range: number;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ScoutDrone implements ISurveyDrone {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  get range() {
    return this.reactor.output * 10;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  global: true,
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
  exports: [DRONE],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Engineering, Tactical] }),
);

const range = ship.get(DRONE).range; // -> 12.1
console.log(range);
```

<!-- #endregion global -->

<!-- #region swap -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { ModuleRef } from '@nexusdi/core';

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
class SimulatedReactor implements IReactorCore {
  readonly output = 0;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Reactor output ${this.reactor.output} GW.`;
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
const SimulatorEngineering = defineModule({
  name: 'SimulatorEngineering',
  providers: [
    provide(REACTOR, { useClass: SimulatedReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});

async function statusWith(engineering: ModuleRef) {
  await using ship = await Nexus.create(
    defineModule({ name: 'Meridian', imports: [engineering] }),
  );
  return ship.get(COMPUTER).status();
}

const flight = await statusWith(Engineering); // -> 'Reactor output 1.21 GW.'
console.log(flight);

const simulator = await statusWith(SimulatorEngineering); // -> 'Reactor output 0 GW.'
console.log(simulator);
```

<!-- #endregion swap -->
