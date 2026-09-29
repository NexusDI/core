import { describe, expect, it } from 'vitest';

import { Token, defineModule, provide } from '@nexusdi/core';

import { inspect } from './index.js';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StellarCharts implements INavCharts {
  plot(to: string): string {
    return `course to ${to}`;
  }
}

describe('inspect', () => {
  it('names the class a class provider binds to its token', () => {
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
      exports: [NAV_CHARTS],
    });
    expect(inspect(Navigation).providers[0]).toMatchObject({
      token: 'NavCharts',
      kind: 'class',
      implementation: 'StellarCharts',
    });
  });

  it('reports null for a factory provider', () => {
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [
        provide(NAV_CHARTS, {
          useFactory: () => new StellarCharts(),
          deps: [],
        }),
      ],
    });
    expect(inspect(Navigation).providers[0]?.implementation).toBeNull();
  });
});
