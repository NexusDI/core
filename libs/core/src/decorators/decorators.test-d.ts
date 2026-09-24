import { describe, it } from 'vitest';

import { Inject, Injectable, Module, Token, optional } from '../index.js';

class ReactorCore {
  output = 1.21;
}
class SubspaceLink {
  frequency = 1420;
}
interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const OPTIONS = new Token<number>('Options');

describe('Injectable', () => {
  it('checks deps against the constructor of the class it decorates', () => {
    @Injectable({ deps: [ReactorCore] })
    class Computer {
      constructor(readonly reactor: ReactorCore) {}
    }

    // @ts-expect-error SubspaceLink is not a ReactorCore
    @Injectable({ deps: [SubspaceLink] })
    class Broken {
      constructor(readonly reactor: ReactorCore) {}
    }
    void [Computer, Broken];
  });
});

describe('Inject', () => {
  it('checks the dep against the accessor type', () => {
    class Bridge {
      @Inject(NAV_CHARTS) accessor charts!: NavCharts;
      @Inject(optional(SubspaceLink)) accessor link!: SubspaceLink | undefined;
      // @ts-expect-error NavCharts is not a ReactorCore
      @Inject(NAV_CHARTS) accessor wrong!: ReactorCore;
    }
    void Bridge;
  });
});

describe('Module', () => {
  it('checks provider literals as defineModule does', () => {
    @Module({
      providers: [
        ReactorCore,
        { token: NAV_CHARTS, useValue: { plot: () => 'x' } },
      ],
    })
    class Engineering {}

    @Module({
      providers: [
        // @ts-expect-error a number is not a NavCharts
        { token: NAV_CHARTS, useValue: 42 },
      ],
    })
    class Broken {}
    void [Engineering, Broken];
  });

  it('rejects options and schema, which only defineModule supports', () => {
    // @ts-expect-error @Module classes are not configurable
    @Module({ options: OPTIONS })
    class Comms {}
    void Comms;
  });
});
