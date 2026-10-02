# NEXUS_LOADED_AFTER_SCOPE examples

Regions for `apps/docs/content/errors/NEXUS_LOADED_AFTER_SCOPE.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { Scope } from '@nexusdi/core';
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

const Survey = defineModule({
  name: 'Survey',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
const Meridian = defineModule({ name: 'Meridian' });

const getCharts = (shuttle: Scope) => {
  try {
    return shuttle.get(NAV_CHARTS);
  } catch (error) {
    return error;
  }
};

await using ship = await Nexus.create(Meridian);
await using shuttle = await ship.createScope();
await ship.load(Survey);
const thin = getCharts(shuttle);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_LOADED_AFTER_SCOPE] token=NavCharts module=Survey. https://nexus.js.org/errors/NEXUS_LOADED_AFTER_SCOPE'
console.log(line);

await using fullShip = await Nexus.create(Meridian, { plugins: [errors()] });
await using fullShuttle = await fullShip.createScope();
await fullShip.load(Survey);
const full = getCharts(fullShuttle);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_LOADED_AFTER_SCOPE] NavCharts comes from Survey, which was loaded after this scope was created. A scope resolves against the graph current at its creation.', '  Fix: call await scope.extend() after load(), or create a new scope.']
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

const Survey = defineModule({
  name: 'Survey',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await using shuttle = await ship.createScope();
await ship.load(Survey);
await shuttle.extend();
const course = shuttle.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion fix -->
