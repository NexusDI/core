# How do I run code around a service's methods? examples

Regions for `apps/docs/content/interceptors.mdx`. Every block runs as a test.

<!-- #region audit -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor } from '@nexusdi/interceptors';
import type { InterceptorMap, Next } from '@nexusdi/interceptors';

interface IFlightLog {
  readonly entries: string[];
}
interface IShipComputer {
  course(target: string): string;
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');

class ShuttleFlightLog implements IFlightLog {
  readonly entries: string[] = [];
}

class AuditInterceptor implements Interceptor {
  static deps = [FLIGHT_LOG] as const;
  constructor(private readonly log: IFlightLog) {}

  intercept(call: CallContext, next: Next) {
    this.log.entries.push(
      `${call.provider.name}.${String(call.method)}(${call.args.join(', ')})`,
    );
    return next();
  }
}

class QuantumComputer implements IShipComputer {
  static interceptors = {
    methods: { course: [AUDIT] },
  } satisfies InterceptorMap<QuantumComputer>;

  course(target: string) {
    return `course to ${target}`;
  }
}

const Logs = defineModule({
  name: 'Logs',
  providers: [provide(FLIGHT_LOG, { useClass: ShuttleFlightLog })],
  exports: [FLIGHT_LOG],
});
const Engineering = defineModule({
  name: 'Engineering',
  imports: [Logs],
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  exports: [COMPUTER, FLIGHT_LOG],
});

await using ship = await Nexus.create(Engineering, {
  plugins: [
    interceptors({
      imports: [Logs],
      register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
    }),
  ],
});

const course = ship.get(COMPUTER).course('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
const entries = ship.get(FLIGHT_LOG).entries; // -> ['ShipComputer.course(Kepler-442b)']
console.log(entries);
```

<!-- #endregion audit -->

<!-- #region change-the-call -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor } from '@nexusdi/interceptors';
import type { InterceptorMap, Next } from '@nexusdi/interceptors';

interface INavCharts {
  plot(target: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const UPPERCASE = new Token<Interceptor>('Uppercase');
const CACHE = new Token<Interceptor>('Cache');

let plotted = 0;
class StarCharts implements INavCharts {
  static interceptors = {
    methods: { plot: [CACHE, UPPERCASE] },
  } satisfies InterceptorMap<StarCharts>;

  plot(target: string) {
    plotted++;
    return `course to ${target}`;
  }
}

class UppercaseInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    return next(call.args.map((arg) => String(arg).toUpperCase()));
  }
}

class CacheInterceptor implements Interceptor {
  private readonly saved = new Map<string, unknown>();

  intercept(call: CallContext, next: Next) {
    const key = String(call.args[0]);
    if (!this.saved.has(key)) this.saved.set(key, next());
    return this.saved.get(key);
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Tactical',
    providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
    exports: [NAV_CHARTS],
  }),
  {
    plugins: [
      interceptors({
        register: [
          interceptor(UPPERCASE, { useClass: UppercaseInterceptor }),
          interceptor(CACHE, { useClass: CacheInterceptor }),
        ],
      }),
    ],
  },
);

const first = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to KEPLER-442B'
console.log(first);
const second = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to KEPLER-442B'
console.log(second);
const runs = plotted; // -> 1
console.log(runs);
```

<!-- #endregion change-the-call -->

<!-- #region tap -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors, tap } from '@nexusdi/interceptors';
import type { CallContext, Interceptor } from '@nexusdi/interceptors';
import type { InterceptorMap, Next } from '@nexusdi/interceptors';

interface ISubspaceLink {
  send(message: string): Promise<string>;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const TIMING = new Token<Interceptor>('Timing');

const outcomes: string[] = [];

class TimingInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    return tap(next, {
      value: () => outcomes.push(`${String(call.method)} sent`),
      error: () => outcomes.push(`${String(call.method)} failed`),
    });
  }
}

class SubspaceRelay implements ISubspaceLink {
  static interceptors = {
    class: [TIMING],
  } satisfies InterceptorMap<SubspaceRelay>;

  async send(message: string) {
    if (message === '') throw new Error('empty message');
    return `relayed ${message}`;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Comms',
    providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
    exports: [SUBSPACE_LINK],
  }),
  {
    plugins: [
      interceptors({
        register: [interceptor(TIMING, { useClass: TimingInterceptor })],
      }),
    ],
  },
);

const sent = await ship.get(SUBSPACE_LINK).send('hail'); // -> 'relayed hail'
console.log(sent);
const failure = await ship
  .get(SUBSPACE_LINK)
  .send('')
  .catch((caught: unknown) => (caught as Error).message);
const reason = failure; // -> 'empty message'
console.log(reason);
const log = outcomes; // -> ['send sent', 'send failed']
console.log(log);
```

<!-- #endregion tap -->

<!-- #region identity -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor } from '@nexusdi/interceptors';
import type { InterceptorMap, Next } from '@nexusdi/interceptors';

interface IShipComputer {
  status(): string;
  selfTest(): string;
  isSelf(other: unknown): boolean;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');

const calls: string[] = [];
class AuditInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    calls.push(String(call.method));
    return next();
  }
}

class QuantumComputer implements IShipComputer {
  static interceptors = {
    class: [AUDIT],
  } satisfies InterceptorMap<QuantumComputer>;
  #serial = 'QC-7';

  status() {
    return `online ${this.#serial}`;
  }
  selfTest() {
    return this.status();
  }
  isSelf(other: unknown) {
    return other === this;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(COMPUTER, { useClass: QuantumComputer })],
    exports: [COMPUTER],
  }),
  {
    plugins: [
      interceptors({
        register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
      }),
    ],
  },
);

const computer = ship.get(COMPUTER);
const isInstance = computer instanceof QuantumComputer; // -> true
console.log(isInstance);
const sameObject = computer.isSelf(computer); // -> false
console.log(sameObject);
const status = computer.selfTest(); // -> 'online QC-7'
console.log(status);
const intercepted = calls; // -> ['isSelf', 'selfTest']
console.log(intercepted);
```

<!-- #endregion identity -->

<!-- #region global -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IFlightLog {
  readonly entries: string[];
}
interface IReactorCore {
  output(): number;
}
interface IShipComputer {
  status(): string;
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');

class ShuttleFlightLog implements IFlightLog {
  readonly entries: string[] = [];
}
class FusionReactor implements IReactorCore {
  output() {
    return 1.21;
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `online at ${this.reactor.output()} GW`;
  }
}
class AuditInterceptor implements Interceptor {
  static deps = [FLIGHT_LOG] as const;
  constructor(private readonly log: IFlightLog) {}
  intercept(call: CallContext, next: Next) {
    this.log.entries.push(`${call.provider.token}.${String(call.method)}`);
    return next();
  }
}

const Logs = defineModule({
  name: 'Logs',
  providers: [provide(FLIGHT_LOG, { useClass: ShuttleFlightLog })],
  exports: [FLIGHT_LOG],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    imports: [Logs],
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: QuantumComputer }),
    ],
    exports: [FLIGHT_LOG, COMPUTER],
  }),
  {
    plugins: [
      interceptors({
        imports: [Logs],
        register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
        global: [
          { use: AUDIT, when: ({ provider }) => provider.token !== REACTOR },
        ],
        exempt: [FLIGHT_LOG],
      }),
    ],
  },
);

const status = ship.get(COMPUTER).status(); // -> 'online at 1.21 GW'
console.log(status);
const entries = ship.get(FLIGHT_LOG).entries; // -> ['ShipComputer.status']
console.log(entries);
```

<!-- #endregion global -->

<!-- #region exempt-missing -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IFlightLog {
  readonly entries: string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const AUDIT = new Token<Interceptor>('Audit');

class ShuttleFlightLog implements IFlightLog {
  readonly entries: string[] = [];
}
class AuditInterceptor implements Interceptor {
  static deps = [FLIGHT_LOG] as const;
  constructor(private readonly log: IFlightLog) {}
  intercept(call: CallContext, next: Next) {
    this.log.entries.push(String(call.method));
    return next();
  }
}

const Logs = defineModule({
  name: 'Logs',
  providers: [provide(FLIGHT_LOG, { useClass: ShuttleFlightLog })],
  exports: [FLIGHT_LOG],
});

const error = await Nexus.create(
  defineModule({ name: 'Engineering', imports: [Logs], exports: [FLIGHT_LOG] }),
  {
    plugins: [
      interceptors({
        imports: [Logs],
        register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
        global: [AUDIT],
      }),
    ],
  },
).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const message = inner?.message; // -> '[NEXUS_INTERCEPTOR_INVALID] reason=unexempted-dep token=Audit target=FlightLog detail=FlightLog. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_INVALID'
console.log(message);
```

<!-- #endregion exempt-missing -->

<!-- #region lifetime -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';

interface IShipComputer {
  status(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');

class QuantumComputer implements IShipComputer {
  status() {
    return 'online';
  }
}
class AuditInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}

const error = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(COMPUTER, { useClass: QuantumComputer })],
    exports: [COMPUTER],
  }),
  {
    plugins: [
      errors({ text: [interceptorsText] }),
      interceptors({
        register: [
          interceptor(AUDIT, {
            useClass: AuditInterceptor,
            lifetime: 'scoped',
          }),
        ],
        global: [AUDIT],
      }),
    ],
  },
).catch((caught: unknown) => caught);
const found = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = found.map((inner) => inner.code); // -> ['NEXUS_LIFETIME_VIOLATION', 'NEXUS_INTERCEPTOR_LIFETIME']
console.log(codes);
const lifetime = found.find(
  (inner) => inner.code === 'NEXUS_INTERCEPTOR_LIFETIME',
);
const lines = lifetime?.message.split('\n'); // -> ['[NEXUS_INTERCEPTOR_LIFETIME] the interceptor Audit is scoped, and interceptors are singletons.', '  Fix: remove its lifetime, and read request data from call.instance.']
console.log(lifetime?.message);
```

<!-- #endregion lifetime -->

<!-- #region decorator -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { UseInterceptors, interceptor } from '@nexusdi/interceptors';
import { interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IShipComputer {
  course(target: string): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');

const audited: string[] = [];
class AuditInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    audited.push(String(call.method));
    return next();
  }
}

class QuantumComputer implements IShipComputer {
  @UseInterceptors(AUDIT)
  course(target: string) {
    return `course to ${target}`;
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(COMPUTER, { useClass: QuantumComputer })],
    exports: [COMPUTER],
  }),
  {
    plugins: [
      interceptors({
        register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
      }),
    ],
  },
);

const course = ship.get(COMPUTER).course('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
const methods = audited; // -> ['course']
console.log(methods);
```

<!-- #endregion decorator -->

<!-- #region binding -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface INavCharts {
  plot(target: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const AUDIT = new Token<Interceptor>('Audit');

const audited: string[] = [];
class AuditInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    audited.push(`${call.provider.token}.${String(call.method)}`);
    return next();
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Tactical',
    providers: [
      provide(NAV_CHARTS, {
        useFactory: (): INavCharts => ({
          plot: (target) => `course to ${target}`,
        }),
      }),
    ],
    exports: [NAV_CHARTS],
  }),
  {
    plugins: [
      interceptors({
        register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
        bindings: [{ token: NAV_CHARTS, methods: { plot: [AUDIT] } }],
      }),
    ],
  },
);

const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
const methods = audited; // -> ['NavCharts.plot']
console.log(methods);
```

<!-- #endregion binding -->
