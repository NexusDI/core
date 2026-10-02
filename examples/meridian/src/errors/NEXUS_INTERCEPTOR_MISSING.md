# NEXUS_INTERCEPTOR_MISSING examples

Regions for `apps/docs/content/errors/NEXUS_INTERCEPTOR_MISSING.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IReactorCore {
  output(): number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const TRACE = new Token<Interceptor>('Trace');
const AUDIT = new Token<Interceptor>('Audit');

class TraceInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}
class FusionReactor implements IReactorCore {
  output() {
    return 1.21;
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

// The global entry names AUDIT, and register lists TRACE alone.
const error = await Nexus.create(Engineering, {
  plugins: [
    interceptors({
      register: [interceptor(TRACE, { useClass: TraceInterceptor })],
      global: [AUDIT],
    }),
  ],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_INTERCEPTOR_MISSING] token=Audit. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_MISSING'
console.log(message);
```

<!-- #endregion reproduce -->

<!-- #region full-text -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';

interface IReactorCore {
  output(): number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const TRACE = new Token<Interceptor>('Trace');
const AUDIT = new Token<Interceptor>('Audit');

class TraceInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}
class FusionReactor implements IReactorCore {
  output() {
    return 1.21;
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

const error = await Nexus.create(Engineering, {
  plugins: [
    errors({ text: [interceptorsText] }),
    interceptors({
      register: [interceptor(TRACE, { useClass: TraceInterceptor })],
      global: [AUDIT],
    }),
  ],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ['[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Audit, which is not registered.', '  Fix: add Audit to interceptors({ register }).']
console.log(lines?.join('\n'));
```

<!-- #endregion full-text -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

interface IReactorCore {
  output(): number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const TRACE = new Token<Interceptor>('Trace');
const AUDIT = new Token<Interceptor>('Audit');

const calls: string[] = [];
class TraceInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    calls.push('trace');
    return next();
  }
}
class AuditInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    calls.push('audit');
    return next();
  }
}
class FusionReactor implements IReactorCore {
  output() {
    return 1.21;
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

await using ship = await Nexus.create(Engineering, {
  plugins: [
    interceptors({
      register: [
        interceptor(TRACE, { useClass: TraceInterceptor }),
        interceptor(AUDIT, { useClass: AuditInterceptor }),
      ],
      global: [TRACE, AUDIT],
    }),
  ],
});
const output = ship.get(REACTOR).output(); // -> 1.21
console.log(output);
const seen = calls; // -> ['trace', 'audit']
console.log(seen);
```

<!-- #endregion fix -->
