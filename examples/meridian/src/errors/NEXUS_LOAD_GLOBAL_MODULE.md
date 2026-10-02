# NEXUS_LOAD_GLOBAL_MODULE examples

Regions for `apps/docs/content/errors/NEXUS_LOAD_GLOBAL_MODULE.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}

const Navigation = defineModule({
  name: 'Navigation',
  global: true,
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
const Meridian = defineModule({ name: 'Meridian' });

await using ship = await Nexus.create(Meridian);
const thin = await ship.load(Navigation).catch((error: unknown) => error);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_LOAD_GLOBAL_MODULE] module=Navigation. https://nexus.js.org/errors/NEXUS_LOAD_GLOBAL_MODULE'
console.log(line);

await using fullShip = await Nexus.create(Meridian, { plugins: [errors()] });
const full = await fullShip.load(Navigation).catch((error: unknown) => error);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ["[NEXUS_LOAD_GLOBAL_MODULE] Navigation is global and cannot be loaded after startup, because every module's bindings are already computed.", '  Fix: import Navigation from the root module, or make it non-global.']
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

class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await ship.load(Navigation);
const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion fix -->
