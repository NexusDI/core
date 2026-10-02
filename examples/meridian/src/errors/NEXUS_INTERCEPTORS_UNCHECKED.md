# NEXUS_INTERCEPTORS_UNCHECKED examples

Regions for `apps/docs/content/errors/NEXUS_INTERCEPTORS_UNCHECKED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';
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

const real = interceptors({
  register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
  global: [AUDIT],
});
// A wrapper that forwards the plugin's modules and construct hook, and drops
// its compile hook, so no compile.check of the plugin sees any provider.
const wrapped: NexusPlugin = { ...real, compile: {} };
const error = await Nexus.create(Engineering, { plugins: [wrapped] }).catch(
  (caught: unknown) => caught,
);
if (!isNexusError(error, 'NEXUS_PROVIDER_FAILED')) throw error;
const plugin = error.cause;
if (!isNexusError(plugin, 'NEXUS_PLUGIN_FAILED')) throw error;
const inner = plugin.cause;
const codeOf = (e: unknown) => (isNexusError(e) ? e.code : null);
const codes = [error, plugin, inner].map(codeOf); // -> ['NEXUS_PROVIDER_FAILED', 'NEXUS_PLUGIN_FAILED', 'NEXUS_INTERCEPTORS_UNCHECKED']
console.log(codes);
const hook = plugin.hook; // -> 'construct'
console.log(hook);
const lines = isNexusError(inner) ? inner.message.split('\n') : null; // -> ['[NEXUS_INTERCEPTORS_UNCHECKED] ReactorCore was built from a provider that no compile.check of this interceptors() plugin saw, so its interceptors are unknown.', "  Fix: install @nexusdi/interceptors at the version of @nexusdi/core, and let only the container call the plugin's hooks."]
console.log(lines);
```

<!-- #endregion reproduce -->

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

const real = interceptors({
  register: [interceptor(AUDIT, { useClass: AuditInterceptor })],
  global: [AUDIT],
});
// The container calls every hook of the plugin, and no other code does.
await using ship = await Nexus.create(Engineering, { plugins: [real] });
const output = ship.get(REACTOR).output(); // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
