# NEXUS_INVALID_EXPORT examples

Regions for `apps/docs/content/errors/NEXUS_INVALID_EXPORT.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
interface IPowerRouter {
  divert(): number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR, POWER_ROUTER],
});

const thin = await Nexus.create(Engineering).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_INVALID_EXPORT] token=PowerRouter module=Engineering. https://nexus.js.org/errors/NEXUS_INVALID_EXPORT'
console.log(line);

const full = await Nexus.create(Engineering, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_INVALID_EXPORT] Engineering exports PowerRouter, which it neither provides nor sees through an import.', '  Fix: provide PowerRouter in Engineering, or import the module that exports it.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IPowerRouter {
  divert(): number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class PlasmaRouter implements IPowerRouter {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  divert() {
    return this.reactor.output / 2;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(POWER_ROUTER, { useClass: PlasmaRouter }),
  ],
  exports: [REACTOR, POWER_ROUTER],
});

await using ship = await Nexus.create(Engineering);
const diverted = ship.get(POWER_ROUTER).divert(); // -> 0.605
console.log(diverted);
```

<!-- #endregion fix -->
