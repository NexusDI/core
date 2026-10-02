# NEXUS_INTERCEPTORS_SHARED examples

Regions for `apps/docs/content/errors/NEXUS_INTERCEPTORS_SHARED.mdx`. Every block runs as a test.

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

// One plugin object, passed to two containers that are open at once.
const shared = interceptors({
  register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
  global: [AUDIT],
});
await using _ship = await Nexus.create(Engineering, { plugins: [shared] });
const error = await Nexus.create(Engineering, { plugins: [shared] }).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const message = inner?.message; // -> '[NEXUS_INTERCEPTORS_SHARED] https://nexus.js.org/errors/NEXUS_INTERCEPTORS_SHARED'
console.log(message);
```

<!-- #endregion reproduce -->

<!-- #region overlap -->

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

// Two creates that overlap: both compile before either builds.
const shared = interceptors({
  register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
  global: [AUDIT],
});
const [first, second] = await Promise.allSettled([
  Nexus.create(Engineering, { plugins: [shared] }),
  Nexus.create(Engineering, { plugins: [shared] }),
]);
await using _ship = first.status === 'fulfilled' ? first.value : undefined;
const failed = second.status === 'rejected' ? second.reason : undefined;
if (!isNexusError(failed, 'NEXUS_PROVIDER_FAILED')) throw failed;
const pluginError = failed.cause;
if (!isNexusError(pluginError, 'NEXUS_PLUGIN_FAILED')) throw failed;
const inner = pluginError.cause;
// the code of an error, or null
const codeOf = (e: unknown) => (isNexusError(e) ? e.code : null);
const codes = [failed, pluginError, inner].map(codeOf); // -> ['NEXUS_PROVIDER_FAILED', 'NEXUS_PLUGIN_FAILED', 'NEXUS_INTERCEPTORS_SHARED']
console.log(codes);
const lines = isNexusError(inner) ? inner.message.split('\n') : null; // -> ['[NEXUS_INTERCEPTORS_SHARED] this interceptors() plugin is in use by a running container or an unfinished create.', '  Fix: call interceptors() once per container.']
console.log(lines);
```

<!-- #endregion overlap -->

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

const shared = interceptors({
  register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
  global: [AUDIT],
});
const plugins = [errors({ text: [interceptorsText] }), shared];
await using _ship = await Nexus.create(Engineering, { plugins });
const error = await Nexus.create(Engineering, { plugins }).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ['[NEXUS_INTERCEPTORS_SHARED] this interceptors() plugin is in use by a running container or an unfinished create.', '  Fix: call interceptors() once per container.']
console.log(lines);
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

// One interceptors() call per container.
const plugins = () => [
  interceptors({
    register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
    global: [AUDIT],
  }),
];
await using ship = await Nexus.create(Engineering, { plugins: plugins() });
await using simulator = await Nexus.create(Engineering, { plugins: plugins() });
const outputs = [ship.get(REACTOR).output(), simulator.get(REACTOR).output()]; // -> [1.21, 1.21]
console.log(outputs);
```

<!-- #endregion fix -->
