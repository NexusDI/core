# Testing examples

## Overrides keep the lifetime

An override keeps the lifetime of the binding it replaces.

<!-- #region override-lifetime -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IDrone {
  readonly serial: number;
}
const DRONE = new Token<IDrone>('SurveyDrone');

let built = 0;
class SurveyDrone implements IDrone {
  readonly serial = ++built;
}
class TrainingDrone implements IDrone {
  readonly serial = 0;
}
const Hangar = defineModule({
  name: 'Hangar',
  providers: [provide(DRONE, { useClass: SurveyDrone, lifetime: 'transient' })],
});

await using sim = await createTestingContainer(Hangar)
  .override(DRONE, { useClass: TrainingDrone })
  .create();
sim.get(DRONE).serial; // -> 0
sim.get(DRONE) === sim.get(DRONE); // -> false
```

<!-- #endregion override-lifetime -->

## Module overrides

`overrideModule()` replaces a module wherever the graph imports it.

<!-- #region override-module -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface ISubspaceLink {
  send(message: string): string;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
class SubspaceRelay implements ISubspaceLink {
  send(message: string) {
    return `relayed ${message}`;
  }
}
class LoopbackLink implements ISubspaceLink {
  send(message: string) {
    return `loopback ${message}`;
  }
}

const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const CommsStub = defineModule({
  name: 'CommsStub',
  providers: [provide(SUBSPACE_LINK, { useClass: LoopbackLink })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Comms] });

await using sim = await createTestingContainer(Meridian)
  .overrideModule(Comms, CommsStub)
  .create();
sim.get(SUBSPACE_LINK).send('hail'); // -> 'loopback hail'
```

<!-- #endregion override-module -->
