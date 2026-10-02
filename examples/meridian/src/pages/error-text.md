# How do I get the full text of every error? examples

Regions for `apps/docs/content/error-text.mdx`. Every block runs as a test.

<!-- #region package-pack -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';

interface IShipComputer {
  status(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');
const TRACE = new Token<Interceptor>('Trace');
class TraceInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}
class QuantumComputer implements IShipComputer {
  status() {
    return 'online';
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  exports: [COMPUTER],
});

async function firstMessage(textPlugin: NexusPlugin) {
  const error = await Nexus.create(Engineering, {
    plugins: [
      textPlugin,
      interceptors({
        register: [interceptor(TRACE, { useClass: TraceInterceptor })],
        global: [AUDIT],
      }),
    ],
  }).catch((caught: unknown) => caught);
  return isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
    ? (error.errors[0]?.message ?? '')
    : '';
}

const thin = await firstMessage(errors()); // -> '[NEXUS_INTERCEPTOR_MISSING] token=Audit. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_MISSING'
console.log(thin);
const full = await firstMessage(errors({ text: [interceptorsText] })); // -> '[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Audit, which is not registered.\n  Fix: add Audit to interceptors({ register }).'
console.log(full);
```

<!-- #endregion package-pack -->

<!-- #region translate -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { ErrorTextPack } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const swedish = {
  NEXUS_MISSING_PROVIDER: (error) => ({
    message: `${error.requester} i ${error.module} behöver ${error.token}, men ingen modul tillhandahåller den.`,
    fix: `tillhandahåll ${error.token} i ${error.module} eller i en modul som ${error.module} importerar.`,
  }),
} satisfies ErrorTextPack;

const error = await Nexus.create(Engineering, {
  plugins: [errors({ text: [swedish] })],
}).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const message = inner?.message; // -> '[NEXUS_MISSING_PROVIDER] ShipComputer i Engineering behöver NavCharts, men ingen modul tillhandahåller den.\n  Fix: tillhandahåll NavCharts i Engineering eller i en modul som Engineering importerar.'
console.log(message);
```

<!-- #endregion translate -->

<!-- #region explain -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Engineering).catch(
  (caught: unknown) => caught,
);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const logged = inner?.message; // -> '[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
console.log(logged);
const text = inner === undefined ? undefined : explain(inner);
const full = text?.message; // -> 'ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.\n  Fix: provide NavCharts in Engineering or in a module Engineering imports.'
console.log(full);
```

<!-- #endregion explain -->

<!-- #region devtools-and-inspect -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { devtools, inspect } from '@nexusdi/devtools';
import { interceptor, interceptors } from '@nexusdi/interceptors';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';

interface IShipComputer {
  status(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const AUDIT = new Token<Interceptor>('Audit');
const TRACE = new Token<Interceptor>('Trace');
class TraceInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}
class QuantumComputer implements IShipComputer {
  status() {
    return 'online';
  }
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  exports: [COMPUTER],
});

const text = [interceptorsText];
const audit = () =>
  interceptors({
    register: [interceptor(TRACE, { useClass: TraceInterceptor })],
    global: [AUDIT],
  });
const firstLine = (error: unknown) =>
  isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
    ? error.errors[0]?.message.split('\n')[0]
    : undefined;

const created = await Nexus.create(Engineering, {
  plugins: [devtools({ text }), audit()],
}).catch((caught: unknown) => caught);
const fromDevtools = firstLine(created); // -> '[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Audit, which is not registered.'
console.log(fromDevtools);

let checked: unknown;
try {
  inspect(Engineering, { text, plugins: [audit()] });
} catch (caught) {
  checked = caught;
}
const fromInspect = firstLine(checked); // -> '[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Audit, which is not registered.'
console.log(fromInspect);
```

<!-- #endregion devtools-and-inspect -->

<!-- #region own-text -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const SHIELD_GRID = new Token<{ readonly strength: number }>('ShieldGrid');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

const error = await createTestingContainer(Engineering)
  .override(SHIELD_GRID, { useValue: { strength: 1 } })
  .create()
  .catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : null;
const message = inner?.message; // -> '[NEXUS_OVERRIDE_UNUSED] override(ShieldGrid) matched no provider in the module graph.\n  Fix: remove the override, or import the module that provides ShieldGrid.'
console.log(message);
```

<!-- #endregion own-text -->
