# NEXUS_INTERCEPTOR_LIFETIME examples

Regions for `apps/docs/content/errors/NEXUS_INTERCEPTOR_LIFETIME.mdx`. Every block runs as a test.

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
const AUDIT = new Token<Interceptor>('Audit');

const audited: string[] = [];
class AuditInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    audited.push(`${call.provider.name} in ${call.scope ?? 'root'}`);
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
    interceptors({
      register: [
        interceptor(AUDIT, {
          useClass: AuditInterceptor,
          lifetime: 'transient',
        }),
      ],
      global: [AUDIT],
    }),
  ],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_INTERCEPTOR_LIFETIME] token=Audit detail=transient. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_LIFETIME'
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
      register: [
        interceptor(AUDIT, {
          useClass: AuditInterceptor,
          lifetime: 'transient',
        }),
      ],
      global: [AUDIT],
    }),
  ],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ['[NEXUS_INTERCEPTOR_LIFETIME] the interceptor Audit is transient, and interceptors are singletons.', '  Fix: remove its lifetime, and read request data from call.instance.']
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
const AUDIT = new Token<Interceptor>('Audit');

const audited: string[] = [];
class AuditInterceptor implements Interceptor {
  intercept(call: CallContext, next: Next) {
    audited.push(`${call.provider.name} in ${call.scope ?? 'root'}`);
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
      register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
      global: [AUDIT],
    }),
  ],
});
const output = ship.get(REACTOR).output(); // -> 1.21
console.log(output);
const entries = audited; // -> ['ReactorCore in root']
console.log(entries);
```

<!-- #endregion fix -->
