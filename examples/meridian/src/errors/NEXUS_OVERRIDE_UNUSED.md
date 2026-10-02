# NEXUS_OVERRIDE_UNUSED examples

Regions for `apps/docs/content/errors/NEXUS_OVERRIDE_UNUSED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const fakeCharts: INavCharts = { plot: (to) => `loopback course to ${to}` };

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

// Engineering provides no NAV_CHARTS, so the override replaces nothing.
const error = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create()
  .catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors[0]
  : undefined;
const lines = inner?.message.split('\n'); // -> ['[NEXUS_OVERRIDE_UNUSED] override(NavCharts) matched no provider in the module graph.', '  Fix: remove the override, or import the module that provides NavCharts.']
console.log(lines?.join('\n'));
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (): Promise<INavCharts> => ({
        plot: (to) => `course to ${to}`,
      }),
    }),
  ],
  exports: [NAV_CHARTS],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

const fakeCharts: INavCharts = { plot: (to) => `loopback course to ${to}` };

await using ship = await createTestingContainer(Meridian)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'loopback course to Kepler-442b'
console.log(course);
```

<!-- #endregion fix -->
