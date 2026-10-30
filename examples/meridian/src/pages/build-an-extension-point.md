# Building an Extension Point examples

Regions for `apps/docs/content/build-an-extension-point.mdx`. Every block runs as a test.

<!-- #region library -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  provide,
} from '@nexusdi/core';

// The library: the token, the interface and the collector module.
interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  summary(): string;
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');

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

// The application: a contributor that takes a dep of its own.
interface IReactorProbe {
  temperature(): number;
}
const REACTOR_PROBE = new Token<IReactorProbe>('ReactorProbe');
class CoreProbe implements IReactorProbe {
  temperature() {
    return 410;
  }
}
class ReactorCheck implements IHealthCheck {
  static deps = [REACTOR_PROBE] as const;
  readonly system = 'reactor';
  constructor(private readonly probe: IReactorProbe) {}
  check() {
    return this.probe.temperature() < 500;
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
  providers: [
    provide(REACTOR_PROBE, { useClass: CoreProbe }),
    provide(HEALTH_CHECKS, { useClass: ReactorCheck }),
  ],
  exports: [HEALTH_CHECKS],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [HealthModule],
  providers: [provide(HEALTH_CHECKS, { useClass: HullCheck })],
  exports: [HEALTH_CHECKS],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [HealthModule, Engineering, Tactical],
  }),
);
const summary = ship.get(HEALTH_MONITOR).summary(); // -> 'reactor green, hull red'
console.log(summary);
```

<!-- #endregion library -->

<!-- #region lazy-library -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  Token,
  defineModule,
  lazy,
  all,
  provide,
} from '@nexusdi/core';

interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  run(): void;
  report(system: string): void;
  readonly alarms: readonly string[];
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');

// The library takes the checks lazily, so no contributor writes lazy().
class HealthService implements IHealthMonitor {
  static deps = [lazy(all(HEALTH_CHECKS))] as const;
  private readonly raised: string[] = [];
  constructor(private readonly checks: () => IHealthCheck[]) {}
  run() {
    for (const each of this.checks()) each.check();
  }
  report(system: string) {
    this.raised.push(system);
  }
  get alarms() {
    return this.raised;
  }
}
const HealthModule = defineModule({
  name: 'Health',
  providers: [provide(HEALTH_MONITOR, { useClass: HealthService })],
  exports: [HEALTH_MONITOR],
});

// A third-party check reports to the monitor, and writes a plain dep on it.
class HullCheck implements IHealthCheck {
  static deps = [HEALTH_MONITOR] as const;
  readonly system = 'hull';
  constructor(private readonly monitor: IHealthMonitor) {}
  check() {
    this.monitor.report('hull');
    return false;
  }
}
const Tactical = defineModule({
  name: 'Tactical',
  imports: [HealthModule],
  providers: [provide(HEALTH_CHECKS, { useClass: HullCheck })],
  exports: [HEALTH_CHECKS],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [HealthModule, Tactical] }),
);
const monitor = ship.get(HEALTH_MONITOR);
monitor.run();
const alarms = [...monitor.alarms]; // -> ['hull']
console.log(alarms);
```

<!-- #endregion lazy-library -->

<!-- #region lifetime -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  REQUEST,
  Token,
  all,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';

interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  summary(): string;
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');

// The collector is a singleton, the default lifetime.
class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  summary() {
    return this.checks.map((each) => each.system).join(', ');
  }
}
const HealthModule = defineModule({
  name: 'Health',
  providers: [provide(HEALTH_MONITOR, { useClass: HealthService })],
  exports: [HEALTH_MONITOR],
});
// The contribution is scoped: it reads the request of one scope.
const Tactical = defineModule({
  name: 'Tactical',
  imports: [HealthModule],
  providers: [
    provide(HEALTH_CHECKS, {
      useFactory: (request) => ({
        system: request.mission.target,
        check: () => true,
      }),
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
  exports: [HEALTH_CHECKS],
});

const error = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [HealthModule, Tactical] }),
).catch((caught: unknown) => caught);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_BLUEPRINT_INVALID'
console.log(code);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const violation = isNexusError(inner) ? inner.code : null; // -> 'NEXUS_LIFETIME_VIOLATION'
console.log(violation);
```

<!-- #endregion lifetime -->

<!-- #region lifetime-fix -->

```ts @import.meta.vitest
import {
  MultiToken,
  Nexus,
  REQUEST,
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
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');

class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  summary() {
    return this.checks.map((each) => each.system).join(', ');
  }
}
// The collector is scoped, so each scope reads its own scoped contributions.
const HealthModule = defineModule({
  name: 'Health',
  providers: [
    provide(HEALTH_MONITOR, { useClass: HealthService, lifetime: 'scoped' }),
  ],
  exports: [HEALTH_MONITOR],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [HealthModule],
  providers: [
    provide(HEALTH_CHECKS, {
      useFactory: (request) => ({
        system: request.mission.target,
        check: () => true,
      }),
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
  exports: [HEALTH_CHECKS],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [HealthModule, Tactical] }),
);
await using scope = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const summary = scope.get(HEALTH_MONITOR).summary(); // -> 'Kepler-442b'
console.log(summary);
```

<!-- #endregion lifetime-fix -->

<!-- #region library-test -->

```ts @import.meta.vitest @module
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  provide,
} from '@nexusdi/core';
import { test } from 'vitest';

interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  summary(): string;
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');
class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  private readonly checks: IHealthCheck[];
  constructor(checks: IHealthCheck[]) {
    this.checks = checks;
  }
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

// The library's own test: a fixture root contributes two fakes the way a
// third-party module does, by providing and exporting the token.
const FakeChecks = defineModule({
  name: 'FakeChecks',
  imports: [HealthModule],
  providers: [
    provide(HEALTH_CHECKS, {
      useValue: { system: 'fake-ok', check: () => true },
    }),
    provide(HEALTH_CHECKS, {
      useValue: { system: 'fake-red', check: () => false },
    }),
  ],
  exports: [HEALTH_CHECKS],
});

test('the monitor runs every contributed check', async () => {
  await using ship = await Nexus.create(
    defineModule({ name: 'Fixture', imports: [HealthModule, FakeChecks] }),
  );
  ship.get(HEALTH_MONITOR).summary(); // -> 'fake-ok green, fake-red red'
});
```

<!-- #endregion library-test -->

<!-- #region app-test -->

```ts @import.meta.vitest @module
import {
  MultiToken,
  Nexus,
  Token,
  all,
  defineModule,
  provide,
} from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  summary(): string;
}
interface IReactorProbe {
  temperature(): number;
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');
const REACTOR_PROBE = new Token<IReactorProbe>('ReactorProbe');

class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  private readonly checks: IHealthCheck[];
  constructor(checks: IHealthCheck[]) {
    this.checks = checks;
  }
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
class CoreProbe implements IReactorProbe {
  temperature() {
    return 410;
  }
}
class ReactorCheck implements IHealthCheck {
  static deps = [REACTOR_PROBE] as const;
  readonly system = 'reactor';
  private readonly probe: IReactorProbe;
  constructor(probe: IReactorProbe) {
    this.probe = probe;
  }
  check() {
    return this.probe.temperature() < 500;
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  imports: [HealthModule],
  providers: [
    provide(REACTOR_PROBE, { useClass: CoreProbe }),
    provide(HEALTH_CHECKS, { useClass: ReactorCheck }),
  ],
  exports: [HEALTH_CHECKS],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [HealthModule, Engineering],
});

// test/fixtures.ts: the real graph, with the probe replaced and the token left alone.
const test = nexusTest(base, Meridian, {
  setup: (builder) =>
    builder.override(REACTOR_PROBE, {
      useValue: { temperature: () => 900 },
    }),
});

test('the real reactor check sees the hot probe', ({ nexus }) => {
  nexus.get(HEALTH_MONITOR).summary(); // -> 'reactor red'
});

// A CI test compiles the app and builds nothing.
test('the app wiring compiles', () => {
  Nexus.check(Meridian).unchecked; // -> []
});
```

<!-- #endregion app-test -->

<!-- #region pin -->

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
import { createTestingContainer } from '@nexusdi/testing';

interface IHealthCheck {
  readonly system: string;
  check(): boolean;
}
interface IHealthMonitor {
  summary(): string;
}
const HEALTH_CHECKS = new MultiToken<IHealthCheck>('HealthChecks');
const HEALTH_MONITOR = new Token<IHealthMonitor>('HealthMonitor');
class HealthService implements IHealthMonitor {
  static deps = [all(HEALTH_CHECKS)] as const;
  constructor(private readonly checks: IHealthCheck[]) {}
  summary() {
    return this.checks.map((each) => each.system).join(', ');
  }
}
const HealthModule = defineModule({
  name: 'Health',
  providers: [provide(HEALTH_MONITOR, { useClass: HealthService })],
  exports: [HEALTH_MONITOR],
});
// Tactical forgets exports: [HEALTH_CHECKS].
const Tactical = defineModule({
  name: 'Tactical',
  imports: [HealthModule],
  providers: [
    provide(HEALTH_CHECKS, { useValue: { system: 'hull', check: () => true } }),
  ],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [HealthModule, Tactical],
});

// Without an override the compile finds the mistake.
let found: string | null = null;
try {
  Nexus.check(Meridian);
} catch (caught) {
  const inner = isNexusError(caught, 'NEXUS_BLUEPRINT_INVALID')
    ? caught.errors[0]
    : undefined;
  found = isNexusError(inner) ? inner.code : null; // -> 'NEXUS_UNREAD_CONTRIBUTION'
}
console.log(found);

// An override of the token pins it: one record in every module, no check.
await using ship = await createTestingContainer(Meridian)
  .override(HEALTH_CHECKS, {
    useValue: { system: 'fake', check: () => true },
  })
  .create();
const seen = ship.get(HEALTH_MONITOR).summary(); // -> 'fake'
console.log(seen);
```

<!-- #endregion pin -->
