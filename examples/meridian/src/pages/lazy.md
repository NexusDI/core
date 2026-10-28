# Lazy edges and cycles examples

Regions for `apps/docs/content/lazy.mdx`. Every block runs as a test.

<!-- #region cycle -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';

interface IPowerRouter {
  divert(): number;
}
interface IShieldGrid {
  draw(): number;
}
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

class PlasmaRouter implements IPowerRouter {
  static deps = [SHIELD_GRID] as const;
  constructor(private readonly shields: IShieldGrid) {}
  divert() {
    return this.shields.draw();
  }
}
class DeflectorGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(POWER_ROUTER, { useClass: PlasmaRouter }),
    provide(SHIELD_GRID, { useClass: DeflectorGrid }),
  ],
});

const error = await Nexus.create(Engineering).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = inner.map((each) => each.code); // -> ['NEXUS_CIRCULAR_DEPENDENCY']
console.log(codes);
const cycle = inner[0];
const ring = isNexusError(cycle, 'NEXUS_CIRCULAR_DEPENDENCY') ? cycle.path : [];
const path = ring.join(' -> '); // -> 'PowerRouter -> ShieldGrid -> PowerRouter'
console.log(path);
```

<!-- #endregion cycle -->

<!-- #region lazy-fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

interface IPowerRouter {
  divert(): number;
}
interface IShieldGrid {
  draw(): number;
}
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(SHIELD_GRID)] as const;
  constructor(private readonly shields: () => IShieldGrid) {}
  divert() {
    return this.shields().draw();
  }
}
class DeflectorGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(SHIELD_GRID, { useClass: DeflectorGrid }),
    ],
  }),
);
const draw = ship.get(POWER_ROUTER).divert(); // -> 0.4
console.log(draw);
```

<!-- #endregion lazy-fix -->

<!-- #region indirect-cycle -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';

interface INavComputer {
  plot(): string;
}
interface IHelmControl {
  steer(): string;
}
interface IThrusterBank {
  burn(): string;
}
const NAV_COMPUTER = new Token<INavComputer>('NavComputer');
const HELM_CONTROL = new Token<IHelmControl>('HelmControl');
const THRUSTER_BANK = new Token<IThrusterBank>('ThrusterBank');

class Astrogator implements INavComputer {
  static deps = [HELM_CONTROL] as const;
  constructor(private readonly helm: IHelmControl) {}
  plot() {
    return this.helm.steer();
  }
}
class HelmStation implements IHelmControl {
  static deps = [THRUSTER_BANK] as const;
  constructor(private readonly thrusters: IThrusterBank) {}
  steer() {
    return this.thrusters.burn();
  }
}
class IonThrusters implements IThrusterBank {
  static deps = [NAV_COMPUTER] as const;
  constructor(readonly nav: INavComputer) {}
  burn() {
    return 'course to Kepler-442b';
  }
}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    provide(NAV_COMPUTER, { useClass: Astrogator }),
    provide(HELM_CONTROL, { useClass: HelmStation }),
    provide(THRUSTER_BANK, { useClass: IonThrusters }),
  ],
});

const error = await Nexus.create(Bridge).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const cycle = inner[0];
const ring = isNexusError(cycle, 'NEXUS_CIRCULAR_DEPENDENCY') ? cycle.path : [];
const path = ring.join(' -> '); // -> 'NavComputer -> HelmControl -> ThrusterBank -> NavComputer'
console.log(path);
```

<!-- #endregion indirect-cycle -->

<!-- #region indirect-fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

interface INavComputer {
  plot(): string;
}
interface IHelmControl {
  steer(): string;
}
interface IThrusterBank {
  burn(): string;
}
const NAV_COMPUTER = new Token<INavComputer>('NavComputer');
const HELM_CONTROL = new Token<IHelmControl>('HelmControl');
const THRUSTER_BANK = new Token<IThrusterBank>('ThrusterBank');

class Astrogator implements INavComputer {
  static deps = [HELM_CONTROL] as const;
  constructor(private readonly helm: IHelmControl) {}
  plot() {
    return this.helm.steer();
  }
}
class HelmStation implements IHelmControl {
  static deps = [THRUSTER_BANK] as const;
  constructor(private readonly thrusters: IThrusterBank) {}
  steer() {
    return this.thrusters.burn();
  }
}
class IonThrusters implements IThrusterBank {
  static deps = [lazy(NAV_COMPUTER)] as const;
  constructor(readonly nav: () => INavComputer) {}
  burn() {
    return 'course to Kepler-442b';
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Bridge',
    providers: [
      provide(NAV_COMPUTER, { useClass: Astrogator }),
      provide(HELM_CONTROL, { useClass: HelmStation }),
      provide(THRUSTER_BANK, { useClass: IonThrusters }),
    ],
  }),
);
const course = ship.get(NAV_COMPUTER).plot(); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion indirect-fix -->

<!-- #region not-ready -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  lazy,
  provide,
} from '@nexusdi/core';

interface IPowerRouter {
  readonly reserve: number;
}
interface IShieldGrid {
  draw(): number;
}
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(SHIELD_GRID)] as const;
  readonly reserve: number;
  constructor(shields: () => IShieldGrid) {
    // The thunk runs during construction, before the shield grid exists.
    this.reserve = 1 - shields().draw();
  }
}
class DeflectorGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}

const error = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(SHIELD_GRID, { useClass: DeflectorGrid }),
    ],
  }),
).catch((caught: unknown) => caught);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_PROVIDER_FAILED'
console.log(code);
const cause = isNexusError(error) ? error.cause : undefined;
const reason = isNexusError(cause) ? cause.code : null; // -> 'NEXUS_NOT_READY'
console.log(reason);
```

<!-- #endregion not-ready -->

<!-- #region collector -->

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

interface IPowerConsumer {
  readonly name: string;
  divert(): number;
}
interface IPowerRouter {
  consumers(): IPowerConsumer[];
  divertAll(): number;
}
const POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

// The router calls the thunk later, so it breaks the cycle once for every consumer.
class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(all(POWER_CONSUMERS))] as const;
  constructor(readonly consumers: () => IPowerConsumer[]) {}
  divertAll() {
    return this.consumers().reduce((sum, each) => sum + each.divert(), 0);
  }
}
class ShieldGrid implements IPowerConsumer {
  static deps = [POWER_ROUTER] as const;
  readonly name = 'shields';
  constructor(private readonly router: IPowerRouter) {}
  divert() {
    return 0.4;
  }
}
class Deflector implements IPowerConsumer {
  static deps = [POWER_ROUTER] as const;
  readonly name = 'deflector';
  constructor(private readonly router: IPowerRouter) {}
  divert() {
    return 0.2;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(POWER_CONSUMERS, { useClass: ShieldGrid }),
      provide(POWER_CONSUMERS, { useClass: Deflector }),
    ],
  }),
);
const router = ship.get(POWER_ROUTER);
const names = router.consumers().map((each) => each.name); // -> ['shields', 'deflector']
console.log(names);
const first = router.consumers();
const second = router.consumers();
const sameArray = first === second; // -> false
console.log(sameArray);
const sameInstance = first[0] === second[0]; // -> true
console.log(sameInstance);
```

<!-- #endregion collector -->

<!-- #region collector-not-ready -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  isNexusError,
  lazy,
  provide,
} from '@nexusdi/core';

interface IPowerConsumer {
  readonly name: string;
}
interface IPowerRouter {
  readonly online: boolean;
}
const POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

let cellsBuilt = 0;

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(all(POWER_CONSUMERS))] as const;
  readonly online: boolean;
  constructor(consumers: () => IPowerConsumer[]) {
    // The thunk runs during construction, before the shield grid exists.
    this.online = consumers().length > 0;
  }
}
class ReserveCell implements IPowerConsumer {
  readonly name = 'reserve';
  constructor() {
    cellsBuilt += 1;
  }
}
class ShieldGrid implements IPowerConsumer {
  static deps = [POWER_ROUTER] as const;
  readonly name = 'shields';
  constructor(private readonly router: IPowerRouter) {}
}

const error = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(POWER_CONSUMERS, {
        useClass: ReserveCell,
        lifetime: 'transient',
      }),
      provide(POWER_CONSUMERS, { useClass: ShieldGrid }),
    ],
  }),
).catch((caught: unknown) => caught);
const cause = isNexusError(error) ? error.cause : undefined;
const reason = isNexusError(cause) ? cause.code : null; // -> 'NEXUS_NOT_READY'
console.log(reason);
const target = isNexusError(cause, 'NEXUS_NOT_READY') ? cause.target : null; // -> 'PowerConsumers'
console.log(target);
const built = cellsBuilt; // -> 0
console.log(built);
```

<!-- #endregion collector-not-ready -->

<!-- #region collector-dispose -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  isNexusError,
  lazy,
  provide,
} from '@nexusdi/core';

interface IPowerConsumer {
  readonly name: string;
}
interface IPowerRouter {
  readonly refusal: string | null;
}
const POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

class PlasmaRouter implements IPowerRouter {
  static deps = [lazy(all(POWER_CONSUMERS))] as const;
  refusal: string | null = null;
  constructor(private readonly consumers: () => IPowerConsumer[]) {}
  // The router is created first, so it is disposed last. By then its consumers are gone.
  [Symbol.asyncDispose](): Promise<void> {
    try {
      this.consumers();
    } catch (error) {
      this.refusal = isNexusError(error) ? error.code : null;
    }
    return Promise.resolve();
  }
}
class ShieldGrid implements IPowerConsumer {
  static deps = [POWER_ROUTER] as const;
  readonly name = 'shields';
  constructor(private readonly router: IPowerRouter) {}
  [Symbol.dispose]() {}
}

const ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PlasmaRouter }),
      provide(POWER_CONSUMERS, { useClass: ShieldGrid }),
    ],
  }),
);
const router = ship.get(POWER_ROUTER);
await ship[Symbol.asyncDispose]();
const refusal = router.refusal; // -> 'NEXUS_DISPOSED'
console.log(refusal);
```

<!-- #endregion collector-dispose -->
