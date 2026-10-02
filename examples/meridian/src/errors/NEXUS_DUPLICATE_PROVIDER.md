# NEXUS_DUPLICATE_PROVIDER examples

Regions for `apps/docs/content/errors/NEXUS_DUPLICATE_PROVIDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class SimulatedReactor implements IReactorCore {
  readonly output = 0;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(REACTOR, { useClass: SimulatedReactor }),
  ],
});

const thin = await Nexus.create(Engineering).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_DUPLICATE_PROVIDER] token=ReactorCore module=Engineering. https://nexus.js.org/errors/NEXUS_DUPLICATE_PROVIDER'
console.log(line);

const full = await Nexus.create(Engineering, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_DUPLICATE_PROVIDER] Engineering provides ReactorCore twice.', '  Fix: remove one of them, or use a MultiToken to collect several.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { MultiToken, Nexus, defineModule, provide } from '@nexusdi/core';

interface Diagnostic {
  readonly system: string;
  run(): boolean;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(DIAGNOSTICS, { useValue: { system: 'reactor', run: () => true } }),
    provide(DIAGNOSTICS, { useValue: { system: 'hull', run: () => true } }),
  ],
});

await using ship = await Nexus.create(Engineering);
const systems = ship.get(DIAGNOSTICS).map((check) => check.system); // -> ['reactor', 'hull']
console.log(systems);
```

<!-- #endregion fix -->
