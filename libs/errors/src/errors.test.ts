import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

import { errors } from './index.js';

interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
class ShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: NavCharts) {}
}
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useValue: { plot: () => 'x' } })],
});
const Engineering = defineModule({
  name: 'Engineering',
  providers: [ShipComputer],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Tactical],
});

describe('errors', () => {
  it('writes revision 1 text and fills nearMisses', async () => {
    const error = await Nexus.create(Meridian, { plugins: [errors()] }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_MISSING_PROVIDER',
          nearMisses: [{ kind: 'not-exported', module: 'Tactical' }],
          message:
            '[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.\n' +
            '  NavCharts is provided in Tactical, which does not export it.\n' +
            "  Fix: add NavCharts to Tactical's exports and import Tactical into Engineering.",
        },
      ],
    });
  });

  it('leaves nearMisses empty without the plugin', async () => {
    const error = await Nexus.create(Meridian).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ errors: [{ nearMisses: [] }] });
  });

  it.each([
    {
      name: 'a useFactory that is not a function',
      config: { useFactory: 4 },
      sentence: 'has a useFactory that is not a function',
    },
    {
      name: 'deps that are not an array',
      config: { useFactory: () => ({}), deps: 'freq' },
      sentence: 'has deps that are not an array',
    },
  ])(
    'leads the forRootAsync() reason for $name with the factory detail',
    async ({ config, sentence }) => {
      const OPTIONS = new Token<{ freq: number }>('CommsOptions');
      const Comms = defineModule({ name: 'Comms', options: OPTIONS });
      const error = await Nexus.create(Comms.forRootAsync(config as never), {
        plugins: [errors()],
      }).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toMatchObject({
        errors: [
          {
            code: 'NEXUS_INVALID_PROVIDER',
            message: `[NEXUS_INVALID_PROVIDER] Comms.providers[0] (the forRootAsync() factory) ${sentence}.`,
          },
        ],
      });
    },
  );
});
