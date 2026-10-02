# NEXUS_PLUGIN_VERSION examples

Regions for `apps/docs/content/errors/NEXUS_PLUGIN_VERSION.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';
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
const providers = [provide(REACTOR, { useClass: FusionReactor })];

// A plugin written for a plugin API this core does not support.
const cache: NexusPlugin = { name: 'acme:cache', apiVersion: 2 };

const startup = (plugins: NexusPlugin[]) =>
  Nexus.create(providers, { plugins }).catch((error: unknown) => error);

const thin = await startup([cache]);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const first = thin.errors[0];
const line = first?.message; // -> '[NEXUS_PLUGIN_VERSION] plugin=acme:cache apiVersion=2. https://nexus.js.org/errors/NEXUS_PLUGIN_VERSION'
console.log(line);
if (!isNexusError(first, 'NEXUS_PLUGIN_VERSION')) throw first;
const supported = first.supported; // -> [1]
console.log(supported);

const full = await startup([errors(), cache]);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_PLUGIN_VERSION] acme:cache was written for plugin API 2; this @nexusdi/core supports 1.', '  Fix: install the plugin version built for this @nexusdi/core.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

let built = 0;
const cache: NexusPlugin = {
  name: 'acme:cache',
  apiVersion: NEXUS_PLUGIN_API,
  observe(event) {
    if (event.type === 'construct') built++;
  },
};

await using ship = await Nexus.create(
  [provide(REACTOR, { useClass: FusionReactor })],
  { plugins: [cache] },
);
const output = ship.get(REACTOR).output; // -> 1.21
console.log(output, built);
```

<!-- #endregion fix -->
