# NEXUS_CORE_NOT_SHARED examples

Regions for `apps/docs/content/errors/NEXUS_CORE_NOT_SHARED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, defineModule, isNexusError } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

// A remote that bundles its own copy of core hands over a module that copy
// made. Every copy writes this brand on the modules it makes.
const Cartography = Object.defineProperty(
  { name: 'Cartography', imports: [], providers: [], exports: [] },
  Symbol.for('nexusdi.definition'),
  { value: true },
);

const loadRemote = async (ship: Nexus) => {
  try {
    await ship.load(Cartography as never);
    return null;
  } catch (error) {
    return error;
  }
};

const Meridian = defineModule({ name: 'Meridian' });

await using ship = await Nexus.create(Meridian);
const thin = await loadRemote(ship);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_CORE_NOT_SHARED] received=the module Cartography where=load(). https://nexus.js.org/errors/NEXUS_CORE_NOT_SHARED'
console.log(line);

await using fullShip = await Nexus.create(Meridian, { plugins: [errors()] });
const full = await loadRemote(fullShip);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_CORE_NOT_SHARED] the module Cartography was made by another copy of @nexusdi/core (load()).', '  Fix: load one copy of @nexusdi/core. Check that npm installed it once (npm ls @nexusdi/core), that no test calls vi.resetModules() between the module and the container that reads it, and that no bundler resolves the @nexusdi/source condition for one import and dist for another. In Module Federation, share @nexusdi/core with singleton: true.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { createRequire } from 'node:module';

// The version npm installed. Every @nexusdi package peers on core's exact
// version.
const { version } = createRequire(import.meta.url)(
  '@nexusdi/core/package.json',
) as { version: string };

// The shared entry of the shell's and every remote's Module Federation
// config.
const shared = {
  '@nexusdi/core': { singleton: true, requiredVersion: version },
  '@nexusdi/react': { singleton: true, requiredVersion: version },
};

const core = shared['@nexusdi/core'].singleton; // -> true
console.log(core);
```

<!-- #endregion fix -->
