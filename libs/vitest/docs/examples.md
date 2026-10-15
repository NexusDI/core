# @nexusdi/vitest examples

## Swap an override for one suite

A `nexusSetup` override replaces the file's `setup` for one suite, so it repeats every override it still wants. The tests outside the suite keep the file's setup.

<!-- #region suite-override -->

```ts @import.meta.vitest @module
import { defineModule, provide, Token } from '@nexusdi/core';
import { nexusTest } from '@nexusdi/vitest';
import { describe, test as base } from 'vitest';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const unplottable: INavCharts = {
  plot: () => {
    throw new Error('sector not charted');
  },
};

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

const test = nexusTest(base, Tactical, {
  setup: (builder) => builder.override(NAV_CHARTS, { useValue: fakeCharts }),
});

test('plots with the file setup', ({ nexus }) => {
  nexus.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
});

describe('when the charts cannot plot', () => {
  test.override('nexusSetup', [
    (builder) => builder.override(NAV_CHARTS, { useValue: unplottable }),
  ]);

  test('reports an uncharted sector', ({ nexus }) => {
    let reason = '';
    try {
      nexus.get(NAV_CHARTS).plot('Kepler-442b');
    } catch (error) {
      reason = (error as Error).message;
    }
    reason; // -> 'sector not charted'
  });
});
```

<!-- #endregion suite-override -->
