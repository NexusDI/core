# NEXUS_INVALID_MODULE examples

Regions for `apps/docs/content/errors/NEXUS_INVALID_MODULE.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, defineModule, isNexusError } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

// FusionReactor is a provider class, listed under imports by mistake.
const Meridian = defineModule({ name: 'Meridian', imports: [FusionReactor] });

const thin = await Nexus.create(Meridian).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_INVALID_MODULE] received=the function FusionReactor path=Meridian. https://nexus.js.org/errors/NEXUS_INVALID_MODULE'
console.log(line);

const full = await Nexus.create(Meridian, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_INVALID_MODULE] the function FusionReactor is not a module (imported by Meridian).', '  Fix: create one with defineModule(), or decorate a class with @Module.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using ship = await Nexus.create(Meridian);
const output = ship.get(REACTOR).output; // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
