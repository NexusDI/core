# NEXUS_PLUGIN_CONFLICT examples

Regions for `apps/docs/content/errors/NEXUS_PLUGIN_CONFLICT.mdx`. Every block runs as a test.

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

// Two plugins that each replace the ReactorCore provider before the compiler
// validates the graph.
const swapReactor = (name: string): NexusPlugin => ({
  name,
  apiVersion: NEXUS_PLUGIN_API,
  compile: {
    provider: (provider) =>
      provider.token === REACTOR
        ? { with: provide(REACTOR, { useClass: SimulatedReactor }) }
        : undefined,
  },
});
const plugins = [swapReactor('acme:simulator'), swapReactor('acme:mock')];

const thin = await Nexus.create(providers, { plugins }).catch(
  (error: unknown) => error,
);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const first = thin.errors[0];
const line = first?.message; // -> '[NEXUS_PLUGIN_CONFLICT] plugins=acme:simulator,acme:mock target=ReactorCore. https://nexus.js.org/errors/NEXUS_PLUGIN_CONFLICT'
console.log(line);
if (!isNexusError(first, 'NEXUS_PLUGIN_CONFLICT')) throw first;
const names = first.plugins; // -> ['acme:simulator', 'acme:mock']
console.log(names);

const full = await Nexus.create(providers, {
  plugins: [errors(), ...plugins],
}).catch((error: unknown) => error);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message; // -> '[NEXUS_PLUGIN_CONFLICT] acme:simulator and acme:mock both rewrite ReactorCore; one plugin may rewrite a module or a provider.'
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
class SimulatedReactor implements IReactorCore {
  readonly output = 0;
}

// One plugin rewrites the provider. The other only watches the build.
let built = 0;
const simulator: NexusPlugin = {
  name: 'acme:simulator',
  apiVersion: NEXUS_PLUGIN_API,
  compile: {
    provider: (provider) =>
      provider.token === REACTOR
        ? { with: provide(REACTOR, { useClass: SimulatedReactor }) }
        : undefined,
  },
};
const mock: NexusPlugin = {
  name: 'acme:mock',
  apiVersion: NEXUS_PLUGIN_API,
  observe(event) {
    if (event.type === 'construct') built++;
  },
};

await using ship = await Nexus.create(
  [provide(REACTOR, { useClass: FusionReactor })],
  { plugins: [simulator, mock] },
);
const output = ship.get(REACTOR).output; // -> 0
console.log(output, built);
```

<!-- #endregion fix -->
