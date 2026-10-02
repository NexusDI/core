# NEXUS_DISPOSED examples

Regions for `apps/docs/content/errors/NEXUS_DISPOSED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, isNexusError, provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const afterScram = async (plugins: NexusPlugin[]) => {
  const ship = await Nexus.create(
    [provide(REACTOR, { useClass: FusionReactor })],
    { plugins },
  );
  await ship[Symbol.asyncDispose]();
  try {
    return ship.get(REACTOR);
  } catch (error) {
    return error;
  }
};

const thin = await afterScram([]);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_DISPOSED] target=container. https://nexus.js.org/errors/NEXUS_DISPOSED'
console.log(line);

const full = await afterScram([errors()]);
const text = isNexusError(full) ? full.message : null; // -> '[NEXUS_DISPOSED] the container is disposed or disposing.'
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

async function runVoyage(): Promise<number> {
  await using ship = await Nexus.create([
    provide(REACTOR, { useClass: FusionReactor }),
  ]);
  return ship.get(REACTOR).output;
}

const output = await runVoyage(); // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
