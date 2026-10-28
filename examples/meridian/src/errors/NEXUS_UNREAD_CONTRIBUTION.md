# NEXUS_UNREAD_CONTRIBUTION examples

Regions for `apps/docs/content/errors/NEXUS_UNREAD_CONTRIBUTION.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  isNexusError,
  provide,
  type NexusPlugin,
} from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IHealthCheck {
  readonly system: string;
}
interface IHealthMonitor {
  systems(): string[];
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');

class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  systems() {
    return this.checks.map((each) => each.system);
  }
}
class HullCheck implements IHealthCheck {
  readonly system = 'hull';
}

// Tactical contributes to HEALTH_CHECKS, does not export it, and reads nothing.
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(HEALTH_CHECKS, { useClass: HullCheck })],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical],
  providers: [provide(HEALTH_MONITOR, { useClass: HealthService })],
});

const startup = (plugins: NexusPlugin[]) =>
  Nexus.create(Meridian, { plugins }).catch((error: unknown) => error);

const thin = await startup([]);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_UNREAD_CONTRIBUTION] token=HealthChecks module=Tactical provider=HullCheck. https://nexus.js.org/errors/NEXUS_UNREAD_CONTRIBUTION'
console.log(line);

const full = await startup([errors()]);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_UNREAD_CONTRIBUTION] HullCheck contributes to HealthChecks in Tactical, and no provider can read it.', '  Fix: collect it in Tactical with all(HealthChecks). Or add HealthChecks to the exports of Tactical to publish it to every collector. Or remove the contribution.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix-collect -->

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
}
interface IHullMonitor {
  systems(): string[];
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HULL_MONITOR = new Token<IHullMonitor>('HullMonitor');

class HullCheck implements IHealthCheck {
  readonly system = 'hull';
}
// HullMonitor sits in Tactical and reads the private contribution there.
class HullMonitor implements IHullMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  systems() {
    return this.checks.map((each) => each.system);
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(HEALTH_CHECKS, { useClass: HullCheck }),
    provide(HULL_MONITOR, { useClass: HullMonitor }),
  ],
  exports: [HULL_MONITOR],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Tactical] }),
);
const systems = ship.get(HULL_MONITOR).systems(); // -> ['hull']
console.log(systems);
```

<!-- #endregion fix-collect -->

<!-- #region fix-export -->

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
}
interface IHealthMonitor {
  systems(): string[];
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');

class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  systems() {
    return this.checks.map((each) => each.system);
  }
}
class HullCheck implements IHealthCheck {
  readonly system = 'hull';
}

// Tactical publishes its contribution, so every collector reads it.
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(HEALTH_CHECKS, { useClass: HullCheck })],
  exports: [HEALTH_CHECKS],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Tactical],
    providers: [provide(HEALTH_MONITOR, { useClass: HealthService })],
  }),
);
const systems = ship.get(HEALTH_MONITOR).systems(); // -> ['hull']
console.log(systems);
```

<!-- #endregion fix-export -->
