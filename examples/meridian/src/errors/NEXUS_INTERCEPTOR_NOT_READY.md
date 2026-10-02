# NEXUS_INTERCEPTOR_NOT_READY examples

Regions for `apps/docs/content/errors/NEXUS_INTERCEPTOR_NOT_READY.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IReactorCore {
  output(): number;
  diagnose(): Promise<string>;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const AUDIT = new Token<Interceptor>('Audit');

class AuditInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}
class FusionReactor implements IReactorCore {
  output() {
    return 1.21;
  }
  async diagnose() {
    return 'nominal';
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

const ship = await Nexus.create(Engineering, {
  plugins: [
    interceptors({
      register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
      global: [AUDIT],
    }),
  ],
});
const reactor = ship.get(REACTOR);
await ship[Symbol.asyncDispose]();

// A method that is not async throws; an async method returns a rejected promise.
let thrown: unknown;
try {
  reactor.output();
} catch (caught) {
  thrown = caught;
}
const rejected = await reactor.diagnose().catch((caught: unknown) => caught);

const narrowed = isNexusError(thrown, 'NEXUS_INTERCEPTOR_NOT_READY')
  ? thrown
  : undefined;
const state = narrowed?.state; // -> 'disposed'
console.log(state);
const message = narrowed?.message; // -> '[NEXUS_INTERCEPTOR_NOT_READY] ReactorCore.output was called after its container was disposed.'
console.log(message);
const arrived = isNexusError(rejected) ? rejected.code : null; // -> 'NEXUS_INTERCEPTOR_NOT_READY'
console.log(arrived);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IReactorCore {
  output(): number;
  diagnose(): Promise<string>;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const AUDIT = new Token<Interceptor>('Audit');

class AuditInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}
class FusionReactor implements IReactorCore {
  output() {
    return 1.21;
  }
  async diagnose() {
    return 'nominal';
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

// The container stays open until the program ends.
await using ship = await Nexus.create(Engineering, {
  plugins: [
    interceptors({
      register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
      global: [AUDIT],
    }),
  ],
});
const reactor = ship.get(REACTOR);
const output = reactor.output(); // -> 1.21
console.log(output);
const diagnosis = await reactor.diagnose(); // -> 'nominal'
console.log(diagnosis);
```

<!-- #endregion fix -->
