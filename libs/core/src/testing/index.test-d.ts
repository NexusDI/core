import { describe, expectTypeOf, it } from 'vitest';

import { defineModule, Token, type Nexus } from '../index.js';
import {
  createTestingContainer,
  type TestingContainerBuilder,
} from './index.js';

interface NavCharts {
  plot(to: string): string;
}
class ReactorCore {
  output = 1.21;
}
class FakeReactor extends ReactorCore {}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
class SubspaceLink {}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');
const charts: NavCharts = { plot: (to) => to };
const builder = createTestingContainer(defineModule({ name: 'Root' }));

describe('TestingContainerBuilder', () => {
  it('types override() with the provide() rules', () => {
    expectTypeOf(
      builder.override(NAV_CHARTS, { useValue: charts }),
    ).toEqualTypeOf<TestingContainerBuilder>();
    builder.override(ReactorCore, { useClass: FakeReactor });
    builder.override(NAV_CHARTS, {
      useFactory: (link) => {
        expectTypeOf(link).toEqualTypeOf<SubspaceLink>();
        return charts;
      },
      deps: [SubspaceLink],
    });
    // @ts-expect-error 'nope' does not exist in type 'NavCharts'
    builder.override(NAV_CHARTS, { useValue: { nope: 1 } });
    // @ts-expect-error useExisting is not an override form
    builder.override(COMPUTER, { useExisting: ShipComputer });
  });

  it('creates a Nexus', () => {
    expectTypeOf(builder.create({ onInit: false })).toEqualTypeOf<
      Promise<Nexus>
    >();
  });
});
