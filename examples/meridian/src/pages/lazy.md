# Lazy edges and cycles examples

Regions for `apps/docs/content/lazy.mdx`. Every block runs as a test.

<!-- #region cycle -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { isNexusError, provide } from '@nexusdi/core';

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

<!-- #region not-ready -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { isNexusError, lazy, provide } from '@nexusdi/core';

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
