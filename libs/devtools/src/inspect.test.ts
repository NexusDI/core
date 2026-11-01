import { describe, expect, it } from 'vitest';

import { Token, defineModule, optional, provide } from '@nexusdi/core';

import { thrown } from '../test-support/catch.js';

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

  it('lists the deps that bound to no provider in unresolved', () => {
    class SubspaceLink {}
    class PhasedArray {
      constructor(readonly link: SubspaceLink | undefined) {}
    }
    const Meridian = defineModule({
      name: 'Meridian',
      providers: [provide(PhasedArray, { deps: [optional(SubspaceLink)] })],
    });
    expect(inspect(Meridian).providers[0]?.unresolved).toEqual([
      'SubspaceLink',
    ]);
  });

  describe('unchecked', () => {
    const COMMS_OPTIONS = new Token<{ frequency: number }>('CommsOptions');
    const good = { frequency: 1420 };
    const schemaOf = (validate: () => unknown) =>
      ({ '~standard': { version: 1, vendor: 'test', validate } }) as never;
    const comms = (name: string, validate?: () => unknown) =>
      defineModule({
        name,
        options: COMMS_OPTIONS,
        schema: schemaOf(validate ?? (() => ({ value: good }))),
      });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('lists the modules whose options check() left unchecked, in compile order', async () => {
      const Uplink = comms('Uplink', () => Promise.resolve({ value: good }));
      const Comms = comms('Comms');
      const Meridian = defineModule({
        name: 'Meridian',
        imports: [
          Uplink.forRoot(good),
          Comms.forRootAsync({ useFactory: () => good, deps: [] }),
        ],
      });
      expect(inspect(Meridian).unchecked).toEqual([
        { module: 'Uplink', reason: 'async-schema' },
        { module: 'Comms', reason: 'for-root-async' },
      ]);
      await tick();
    });

    it('lists no unchecked module for a graph whose schemas all ran', () => {
      const Meridian = defineModule({
        name: 'Meridian',
        imports: [comms('Comms').forRoot(good)],
      });
      expect(inspect(Meridian).unchecked).toEqual([]);
    });

    it("throws a schema's own error unwrapped", () => {
      const failure = new Error('frequency must be a number');
      const Meridian = defineModule({
        name: 'Meridian',
        imports: [
          comms('Comms', () => {
            throw failure;
          }).forRoot(good),
        ],
      });
      expect(thrown(() => inspect(Meridian))).toBe(failure);
    });
  });
});
