# NEXUS_LAZY_ASYNC examples

Regions for `apps/docs/content/errors/NEXUS_LAZY_ASYNC.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

// downloadCharts stands in for a JavaScript helper whose typings say it
// returns charts. At run time it returns a promise, which TypeScript cannot see.
const downloadCharts = (async () => ({
  plot: (to: string) => `course to ${to}`,
})) as unknown as () => INavCharts;

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useFactory: () => downloadCharts(), eager: false }),
  ],
  exports: [NAV_CHARTS],
});

const getCharts = (ship: Nexus) => {
  try {
    return ship.get(NAV_CHARTS);
  } catch (error) {
    return error;
  }
};

await using ship = await Nexus.create(Tactical);
const thin = getCharts(ship);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_LAZY_ASYNC] token=NavCharts module=Tactical. https://nexus.js.org/errors/NEXUS_LAZY_ASYNC'
console.log(line);

await using fullShip = await Nexus.create(Tactical, { plugins: [errors()] });
const full = getCharts(fullShip);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_LAZY_ASYNC] NavCharts (module Tactical) is eager: false and its build returned a promise; get() cannot wait for it.', '  Fix: remove eager: false, or make the token a function type and provide () => Promise<T>.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

async function downloadCharts(): Promise<INavCharts> {
  return { plot: (to) => `course to ${to}` };
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useFactory: downloadCharts })],
  exports: [NAV_CHARTS],
});

await using ship = await Nexus.create(Tactical);
const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion fix -->
