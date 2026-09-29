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
});
