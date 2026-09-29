# @nexusdi/testing

`createTestingContainer()` builds the real NexusDI module graph with providers or modules replaced.

```bash
npm install --save-dev @nexusdi/testing @nexusdi/core
```

The version of `@nexusdi/testing` must equal the version of `@nexusdi/core`.

## Testing

A unit test calls the constructor with fakes and needs no container. `@nexusdi/testing` builds the real module graph with replacements.

<!-- #region testing -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (): Promise<INavCharts> => {
        throw new Error('no subspace link in tests');
      },
    }),
  ],
  exports: [NAV_CHARTS],
});

const fakeCharts: INavCharts = { plot: () => 'loopback' };
await using ship = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create({ onInit: false });
ship.get(NAV_CHARTS).plot('anywhere'); // -> 'loopback'
```

<!-- #endregion testing -->

The testing container runs the full compiler, so an override that introduces a missing dependency fails exactly as it would in production.

## Overrides keep the lifetime

An override keeps the lifetime of the binding it replaces, so a transient stays transient.

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

`overrideModule(module, stub)` walks the stub wherever the graph imports the module, including every `forRoot()` and `forRootAsync()` instance of it. Pass `{ lazy: true }` when a later `load()` brings the module in.

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

The builder is immutable: each `override()` returns a new builder, so a `beforeEach` can share a base builder.

## License

MIT
