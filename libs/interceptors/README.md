# @nexusdi/interceptors

`@nexusdi/interceptors` runs code around the methods of services a NexusDI container builds: logging, metrics, validation, caching. An interceptor is a provider with an `intercept(call, next)` method. You register interceptors once, in the `interceptors()` plugin, and attach them globally, per token, per class or per method.

```bash
npm install @nexusdi/interceptors @nexusdi/core
```

The version of `@nexusdi/interceptors` must equal the version of `@nexusdi/core`.

## Intercept a method

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

## Attach interceptors

- On a class you own: `static interceptors = { class: [...], methods: { name: [...] } }`, or `@UseInterceptors(...)` on the class or a method.
- On a token whose provider you cannot edit, or a factory: `interceptors({ bindings: [{ token, class, methods }] })`.
- Everywhere: `interceptors({ global: [TOKEN, { use: TOKEN, when }] })`. `when({ provider, method })` returns false to skip a method.

The chain runs global entries first, then bindings, then class lists, then method lists. A token that appears twice runs once, at its outermost position.

## What to know

- `get()` returns a proxy of an intercepted service. Methods run with `this` set to the service itself, so private fields work, and a call from one method to another on `this` skips interceptors.
- Global entries skip every provider your interceptors depend on, directly or through their own deps, so an interceptor never intercepts a service it calls. Declarations and bindings still apply to those providers.
- `static interceptors` and `@UseInterceptors` name methods on the class or its prototype chain. An arrow-function field is not one, and `create` reports it as `NEXUS_INTERCEPTOR_INVALID`.
- Interceptors are singletons. A scoped or transient interceptor fails at `create` with `NEXUS_INTERCEPTOR_LIFETIME`.
- `next(args)` replaces the arguments. Not calling `next()` returns your value in place of the method's.
- An async method's caller sees a synchronous throw from an interceptor as a rejection. `tap(next, { value, error })` observes sync and async results alike.
- A method called before the interceptors are built (a constructor calling a dependency's method) or after the container is disposed throws `NEXUS_INTERCEPTOR_NOT_READY`.
- Call `interceptors()` once per container.

## License

MIT
