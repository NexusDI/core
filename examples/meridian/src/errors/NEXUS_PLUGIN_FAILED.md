# NEXUS_PLUGIN_FAILED examples

Regions for `apps/docs/content/errors/NEXUS_PLUGIN_FAILED.mdx`. Every block runs as a test.

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

// The setup hook throws, so create rejects.
const cache: NexusPlugin = {
  name: 'acme:cache',
  apiVersion: NEXUS_PLUGIN_API,
  setup() {
    throw new Error('cache store offline');
  },
};

const startup = (plugins: NexusPlugin[]) =>
  Nexus.create(providers, { plugins }).catch((error: unknown) => error);

const thin = await startup([cache]);
if (!isNexusError(thin, 'NEXUS_PLUGIN_FAILED')) throw thin;
const line = thin.message; // -> '[NEXUS_PLUGIN_FAILED] plugin=acme:cache hook=setup. https://nexus.js.org/errors/NEXUS_PLUGIN_FAILED'
console.log(line);
const hook = thin.hook; // -> 'setup'
console.log(hook);
const cause = String(thin.cause); // -> 'Error: cache store offline'
console.log(cause);

const full = await startup([errors(), cache]);
const text = isNexusError(full) ? full.message : null; // -> '[NEXUS_PLUGIN_FAILED] the setup hook of acme:cache failed: Error: cache store offline'
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

// The cache store answers now, so setup finishes.
let online = false;
const cache: NexusPlugin = {
  name: 'acme:cache',
  apiVersion: NEXUS_PLUGIN_API,
  setup() {
    online = true;
  },
};

await using ship = await Nexus.create(
  [provide(REACTOR, { useClass: FusionReactor })],
  { plugins: [cache] },
);
const output = ship.get(REACTOR).output; // -> 1.21
console.log(output, online);
```

<!-- #endregion fix -->
