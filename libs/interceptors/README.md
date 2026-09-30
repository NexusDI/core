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
- Everywhere: `interceptors({ global: [TOKEN, { use: TOKEN, when }] })`. `when({ provider, method })` returns false to skip a method. It runs on the first read of each method, so an error it throws reaches the code that read the method.

The chain runs global entries first, then bindings, then class lists, then method lists. A token that appears twice runs once, at its outermost position.

## What to know

- `get()` returns a proxy of an intercepted service. Methods run with `this` set to the service itself, so private fields work.
- Self calls are not intercepted. As with NestJS's proxy-based enhancers, interceptors wrap the service from the outside, so a call from one method to another on `this` goes to the service itself and skips interceptors. To intercept it, call the method through the injected token, or move it to another service.
- With `global` entries, list in `exempt` every service your interceptors depend on outside `providers`, lazy deps included: `interceptors({ global: [LOG], exempt: [JOURNAL] })`. Global entries skip each exempt service and every provider it reaches, so an interceptor never intercepts a service it calls. `create` fails with `NEXUS_INTERCEPTOR_INVALID` and names every provider that would be skipped until each one is listed, and fails for an `exempt` entry no interceptor depends on. Declarations and bindings still apply to exempt services.
- A class list or binding that names an interceptor on a service that interceptor depends on fails `create`, since each call the interceptor makes into it would run the interceptor again. A method list there is not checked, so keep it to methods the interceptor never calls.
- `static interceptors` and `@UseInterceptors` name methods on the class or its prototype chain. An arrow-function field is not one, and `create` reports it as `NEXUS_INTERCEPTOR_INVALID`.
- With the plugin installed, `static interceptors` is reserved for these declarations. A class that uses the name for anything else, or misspells a key such as `method`, fails `create`.
- `svc.constructor` is the class itself, and a field that holds a class returns it as is, so `new svc.constructor()` works.
- A method that reads a private field of another instance passed as an argument (`other.#id`), or brand-checks one with `#id in other`, throws a `TypeError` when that argument is a proxy. Compare through a public getter.
- Interceptors are singletons. A scoped or transient interceptor fails at `create` with `NEXUS_INTERCEPTOR_LIFETIME`.
- `next(args)` replaces the arguments. Not calling `next()` returns your value in place of the method's.
- An async method's caller sees a synchronous throw from an interceptor as a rejection. `tap(next, { value, error })` observes sync and async results alike.
- A method called before the interceptors are built (a constructor calling a dependency's method) or after the container is disposed throws `NEXUS_INTERCEPTOR_NOT_READY`.
- Call `interceptors()` once per container. A `create` with a plugin object that a running container holds fails with `NEXUS_INTERCEPTORS_SHARED`, and of two overlapping creates with one plugin object, the second to build fails with it. A plugin object whose create failed, or whose container is disposed, can be used again.
- Errors carry core's one-line message. Register `errors()` from `@nexusdi/errors` for the full text and fix line, or pass a caught error to its `explain()`.

## License

MIT
