# NEXUS_AMBIGUOUS_PROVIDER examples

Regions for `apps/docs/content/errors/NEXUS_AMBIGUOUS_PROVIDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface ISubspaceLink {
  readonly frequency: number;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  readonly frequency = 1420;
}
class LaserLink implements ISubspaceLink {
  readonly frequency = 1701;
}

const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Lasers = defineModule({
  name: 'Lasers',
  providers: [provide(SUBSPACE_LINK, { useClass: LaserLink })],
  exports: [SUBSPACE_LINK],
});
const Tactical = defineModule({ name: 'Tactical', imports: [Comms, Lasers] });

const thin = await Nexus.create(Tactical).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_AMBIGUOUS_PROVIDER] token=SubspaceLink module=Tactical candidates=Comms,Lasers. https://nexus.js.org/errors/NEXUS_AMBIGUOUS_PROVIDER'
console.log(line);

const full = await Nexus.create(Tactical, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_AMBIGUOUS_PROVIDER] Tactical sees SubspaceLink from Comms and Lasers, and they provide different instances.', '  Fix: export SubspaceLink from one of them only, or provide SubspaceLink in Tactical, which shadows the imports.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ISubspaceLink {
  readonly frequency: number;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class LaserLink implements ISubspaceLink {
  readonly frequency = 1701;
}

const Lasers = defineModule({
  name: 'Lasers',
  providers: [provide(SUBSPACE_LINK, { useClass: LaserLink })],
  exports: [SUBSPACE_LINK],
});
const Tactical = defineModule({ name: 'Tactical', imports: [Lasers] });

await using ship = await Nexus.create(Tactical);
const frequency = ship.get(SUBSPACE_LINK).frequency; // -> 1701
console.log(frequency);
```

<!-- #endregion fix -->
