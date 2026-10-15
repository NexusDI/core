# Interceptor examples

## An audit interceptor

An interceptor on one method, with a dependency of its own.

<!-- #region intercept -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors, tap } from '@nexusdi/interceptors';
import type { CallContext, Interceptor } from '@nexusdi/interceptors';
import type { InterceptorMap, Next } from '@nexusdi/interceptors';

interface IFlightLog {
  readonly entries: string[];
}
interface INavigator {
  plot(target: string): Promise<string>;
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAVIGATOR = new Token<INavigator>('Navigator');
const AUDIT = new Token<Interceptor>('Audit');

class FlightLog implements IFlightLog {
  readonly entries: string[] = [];
}

class AuditInterceptor implements Interceptor {
  static deps = [FLIGHT_LOG] as const;
  constructor(private readonly log: IFlightLog) {}

  intercept(call: CallContext, next: Next) {
    return tap(next, {
      value: () =>
        this.log.entries.push(`${call.provider.name}.${String(call.method)}`),
    });
  }
}

class Navigator implements INavigator {
  static interceptors = {
    methods: { plot: [AUDIT] },
  } satisfies InterceptorMap<Navigator>;

  async plot(target: string): Promise<string> {
    return `course to ${target}`;
  }
}

const Logs = defineModule({
  name: 'Logs',
  providers: [provide(FLIGHT_LOG, { useClass: FlightLog })],
  exports: [FLIGHT_LOG],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Bridge',
    imports: [Logs],
    providers: [provide(NAVIGATOR, { useClass: Navigator })],
    exports: [NAVIGATOR, FLIGHT_LOG],
  }),
  {
    plugins: [
      interceptors({
        imports: [Logs],
        register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
      }),
    ],
  },
);

const course = await ship.get(NAVIGATOR).plot('Kepler-442b'); // -> 'course to Kepler-442b'
ship.get(FLIGHT_LOG).entries; // -> ['Navigator.plot']
```

<!-- #endregion intercept -->

## Error text

`interceptorsText` gives the interceptor errors their full text.

<!-- #region text -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';

interface IScanner {
  sweep(sector: string): string;
}
const SCANNER = new Token<IScanner>('Scanner');
const TRACE = new Token<Interceptor>('Trace');
const AUDIT = new Token<Interceptor>('Audit');

class Scanner implements IScanner {
  sweep(sector: string): string {
    return `sector ${sector} clear`;
  }
}

class TraceInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}

const Sensors = defineModule({
  name: 'Sensors',
  providers: [provide(SCANNER, { useClass: Scanner })],
  exports: [SCANNER],
});

const messageWith = async (text: boolean) => {
  try {
    await Nexus.create(Sensors, {
      plugins: [
        errors(text ? { text: [interceptorsText] } : undefined),
        interceptors({
          register: [interceptor(TRACE, { useClass: TraceInterceptor })],
          global: [AUDIT],
        }),
      ],
    });
  } catch (error) {
    return (error as { errors: Error[] }).errors[0]?.message.split('\n');
  }
  return undefined;
};

const thin = await messageWith(false);
thin; // -> ['[NEXUS_INTERCEPTOR_MISSING] token=Audit. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_MISSING']
const full = await messageWith(true);
full; // -> ['[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Audit, which is not registered.', '  Fix: add Audit to interceptors({ register }).']
```

<!-- #endregion text -->

## Interceptors declared on the class

`@UseInterceptors()` declares a class's interceptors on the class itself, by the tokens the plugin's `register` list binds. `NavAudit` records each `NAV_CHARTS` call in the audit log.

<!-- #region use-interceptors -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import { UseInterceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface INavCharts {
  plot(to: string): string;
}
interface IAuditLog {
  readonly lines: string[];
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const AUDIT_LOG = new Token<IAuditLog>('AuditLog');
const NAV_AUDIT = new Token<Interceptor>('NavAudit');

class AuditLog implements IAuditLog {
  readonly lines: string[] = [];
}

class NavAudit implements Interceptor {
  static deps = [AUDIT_LOG] as const;
  constructor(private readonly log: IAuditLog) {}
  intercept(call: CallContext, next: Next) {
    this.log.lines.push(`${call.provider.name}.${String(call.method)}`);
    return next();
  }
}

@UseInterceptors(NAV_AUDIT)
class FakeCharts implements INavCharts {
  plot(to: string): string {
    return `course to ${to}`;
  }
}

const AuditTrail = defineModule({
  name: 'AuditTrail',
  providers: [provide(AUDIT_LOG, { useClass: AuditLog })],
  exports: [AUDIT_LOG],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Tactical',
    imports: [AuditTrail],
    providers: [provide(NAV_CHARTS, { useClass: FakeCharts })],
    exports: [NAV_CHARTS, AUDIT_LOG],
  }),
  {
    plugins: [
      interceptors({
        imports: [AuditTrail],
        register: [interceptor(NAV_AUDIT, { useClass: NavAudit })],
      }),
    ],
  },
);
ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
ship.get(AUDIT_LOG).lines; // -> ['NavCharts.plot']
```

<!-- #endregion use-interceptors -->
