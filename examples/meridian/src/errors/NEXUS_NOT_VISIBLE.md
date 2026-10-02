# NEXUS_NOT_VISIBLE examples

Regions for `apps/docs/content/errors/NEXUS_NOT_VISIBLE.mdx`. Every block runs as a test.

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

const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Comms] });

const getLink = (ship: Nexus) => {
  try {
    return ship.get(SUBSPACE_LINK);
  } catch (error) {
    return error;
  }
};

await using ship = await Nexus.create(Meridian);
const thin = getLink(ship);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_NOT_VISIBLE] token=SubspaceLink owners=Comms. https://nexus.js.org/errors/NEXUS_NOT_VISIBLE'
console.log(line);

await using fullShip = await Nexus.create(Meridian, { plugins: [errors()] });
const full = getLink(fullShip);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_NOT_VISIBLE] SubspaceLink is provided in Comms, and the lookup module cannot see it.', '  Fix: export it along a path to the root module, or call get(SubspaceLink, { module: Comms }).']
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

class SubspaceRelay implements ISubspaceLink {
  readonly frequency = 1420;
}

const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Comms] });

await using ship = await Nexus.create(Meridian);
const frequency = ship.get(SUBSPACE_LINK).frequency; // -> 1420
console.log(frequency);
```

<!-- #endregion fix -->
