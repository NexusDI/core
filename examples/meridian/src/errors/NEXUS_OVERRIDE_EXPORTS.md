# NEXUS_OVERRIDE_EXPORTS examples

Regions for `apps/docs/content/errors/NEXUS_OVERRIDE_EXPORTS.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

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
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});
// The stub provides REACTOR and forgets to export it.
const SimulatorEngineering = defineModule({
  name: 'SimulatorEngineering',
  providers: [provide(REACTOR, { useClass: SimulatedReactor })],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

const error = await createTestingContainer(Meridian)
  .overrideModule(Engineering, SimulatorEngineering)
  .create()
  .catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ["[NEXUS_OVERRIDE_EXPORTS] the stub for Engineering does not export ReactorCore, which Engineering exports.", "  Fix: add them to the stub's exports."]
console.log(lines?.join('\n'));
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

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
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});
const SimulatorEngineering = defineModule({
  name: 'SimulatorEngineering',
  providers: [provide(REACTOR, { useClass: SimulatedReactor })],
  exports: [REACTOR],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using sim = await createTestingContainer(Meridian)
  .overrideModule(Engineering, SimulatorEngineering)
  .create();
const output = sim.get(REACTOR).output; // -> 0
console.log(output);
```

<!-- #endregion fix -->
