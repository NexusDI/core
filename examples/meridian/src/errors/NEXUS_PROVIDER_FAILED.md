# NEXUS_PROVIDER_FAILED examples

Regions for `apps/docs/content/errors/NEXUS_PROVIDER_FAILED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

async function downloadCharts(): Promise<INavCharts> {
  throw new Error('subspace link down');
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useFactory: downloadCharts })],
});

const thin = await Nexus.create(Tactical).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_PROVIDER_FAILED')) throw thin;
const line = thin.message; // -> '[NEXUS_PROVIDER_FAILED] token=NavCharts module=Tactical path=NavCharts. https://nexus.js.org/errors/NEXUS_PROVIDER_FAILED'
console.log(line);
const cause = String(thin.cause); // -> 'Error: subspace link down'
console.log(cause);

const full = await Nexus.create(Tactical, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_PROVIDER_FAILED] NavCharts (module Tactical) failed: Error: subspace link down']
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

const cachedCharts: INavCharts = { plot: (to) => `cached course to ${to}` };

async function downloadCharts(): Promise<INavCharts> {
  throw new Error('subspace link down');
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: () => downloadCharts().catch(() => cachedCharts),
    }),
  ],
  exports: [NAV_CHARTS],
});

await using ship = await Nexus.create(Tactical);
const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'cached course to Kepler-442b'
console.log(course);
```

<!-- #endregion fix -->
