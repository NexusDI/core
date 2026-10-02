# NEXUS_INTERCEPTOR_INVALID examples

Regions for `apps/docs/content/errors/NEXUS_INTERCEPTOR_INVALID.mdx`. Every block runs as a test.

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

// register lists AUDIT twice.
const error = await Nexus.create(Engineering, {
  plugins: [
    interceptors({
      register: [
        interceptor(AUDIT, { useClass: AuditInterceptor }),
        interceptor(AUDIT, { useClass: AuditInterceptor }),
      ],
    }),
  ],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_INTERCEPTOR_INVALID] reason=options token=Audit detail=register-twice. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_INVALID'
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
        interceptor(AUDIT, { useClass: AuditInterceptor }),
        interceptor(AUDIT, { useClass: AuditInterceptor }),
      ],
    }),
  ],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_INTERCEPTOR_INVALID] interceptors(): an interceptor is registered twice (Audit).'
console.log(message);
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
    audited.push(String(call.method));
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
const entries = audited; // -> ['output']
console.log(entries);
```

<!-- #endregion fix -->

<!-- #region at-definition -->

```ts @import.meta.vitest
import { Token, isNexusError } from '@nexusdi/core';
import { UseInterceptors } from '@nexusdi/interceptors';
import type { Interceptor } from '@nexusdi/interceptors';

interface IReactorCore {
  output(): number;
}
const AUDIT = new Token<Interceptor>('Audit');

// A decorator on a static method fails when the class is defined.
const define = () => {
  class FusionReactor implements IReactorCore {
    output() {
      return 1.21;
    }
    @UseInterceptors(AUDIT)
    static refit() {
      return 'refitted';
    }
  }
  return FusionReactor;
};
const error = (() => {
  try {
    return define();
  } catch (caught: unknown) {
    return caught;
  }
})();
const invalid = isNexusError(error, 'NEXUS_INTERCEPTOR_INVALID')
  ? error
  : undefined;
const reason = invalid?.reason; // -> 'static-method'
console.log(reason);
const message = invalid?.message; // -> '[NEXUS_INTERCEPTOR_INVALID] @UseInterceptors cannot wrap the static method refit.'
console.log(message);
```

<!-- #endregion at-definition -->
